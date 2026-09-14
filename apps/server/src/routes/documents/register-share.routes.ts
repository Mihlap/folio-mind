import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  DEFAULT_SHARE_LINK_TTL_PRESET,
  SHARE_LINK_TTL_PRESET_IDS,
  type ShareLinkTtlPresetId,
} from '@folio-mind/pdf-contracts';
import { findDocumentForUser, getAuthUser } from '../../lib/documents/document-access.js';
import {
  buildGuestShareUrl,
  createShareLinkToken,
  isShareLinkActive,
  resolveShareLinkUrl,
} from '../../lib/share/share-link.js';
import { encryptShareToken } from '../../lib/share/share-token-cipher.js';
import type { Env } from '../../lib/config/env.js';
import { isS3Configured } from '../../lib/storage/s3.js';
import { hashSharePassword } from '../../lib/share/share-password.js';
import { publishShareLinkDocumentEvent } from '../../lib/events/document-events-bus.js';
import { errorBody } from './schemas.js';

const shareLinkItemSchema = z.object({
  id: z.string(),
  versionId: z.string(),
  version: z.number(),
  expiresAt: z.string(),
  revokedAt: z.string().nullable(),
  allowDownload: z.boolean(),
  allowBookletZip: z.boolean(),
  createdAt: z.string(),
  active: z.boolean(),
  url: z.string().nullable(),
});

export const registerShareRoutes: FastifyPluginAsync<{ env: Env }> = async (app, { env }) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post(
    '/documents/:documentId/share-links',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ documentId: z.string() }),
        body: z.object({
          versionId: z.string().optional(),
          ttl: z
            .enum(SHARE_LINK_TTL_PRESET_IDS as [ShareLinkTtlPresetId, ...ShareLinkTtlPresetId[]])
            .default(DEFAULT_SHARE_LINK_TTL_PRESET),
          allowDownload: z.boolean().optional(),
          allowBookletZip: z.boolean().optional(),
          password: z.preprocess(
            (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
            z
              .string()
              .trim()
              .min(4, 'Пароль ссылки должен быть не короче 4 символов')
              .max(64, 'Пароль ссылки не длиннее 64 символов')
              .optional(),
          ),
        }),
        response: {
          201: z.object({
            id: z.string(),
            url: z.string(),
            expiresAt: z.string(),
            versionId: z.string(),
            version: z.number(),
          }),
          400: errorBody,
          404: errorBody,
          503: errorBody,
        },
      },
    },
    async (request, reply) => {
      if (!isS3Configured()) {
        return reply.code(503).send({ error: 'S3 is not configured' });
      }
      const user = getAuthUser(request);
      const document = await findDocumentForUser(app.prisma, request.params.documentId, user, {
        capability: 'manage_share',
      });
      if (!document) {
        return reply.code(404).send({ error: 'Document not found' });
      }

      const version =
        document.versions.find(
          (v: { id: string; status: string; version: number }) => v.id === request.body.versionId,
        ) ?? document.versions[0];
      if (!version || version.status === 'pending_upload') {
        return reply.code(400).send({ error: 'Версия документа недоступна для просмотра' });
      }

      const { token, tokenHash, expiresAt } = createShareLinkToken(request.body.ttl);
      const passwordHash = request.body.password
        ? await hashSharePassword(request.body.password)
        : null;
      const link = await app.prisma.documentShareLink.create({
        data: {
          documentId: document.id,
          versionId: version.id,
          tokenHash,
          createdById: user.sub,
          expiresAt,
          allowDownload: request.body.allowDownload ?? false,
          allowBookletZip: request.body.allowBookletZip ?? false,
          passwordHash,
          tokenCipher: encryptShareToken(token, env.JWT_SECRET),
        },
      });

      void app.prisma.auditLog.create({
        data: {
          action: 'document.share_create',
          userId: user.sub,
          tenantId: user.tenantId,
          documentId: document.id,
          meta: {
            shareLinkId: link.id,
            versionId: version.id,
            expiresAt: expiresAt.toISOString(),
          },
        },
      });
      void publishShareLinkDocumentEvent(
        env,
        document.id,
        'created',
        link.id,
        version.id,
      ).catch((err) => {
        request.log.warn({ err }, 'share link created event publish failed');
      });

      return reply.code(201).send({
        id: link.id,
        url: buildGuestShareUrl(env, token),
        expiresAt: expiresAt.toISOString(),
        versionId: version.id,
        version: version.version,
      });
    },
  );

  r.get(
    '/documents/:documentId/share-links',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ documentId: z.string() }),
        response: {
          200: z.object({ items: z.array(shareLinkItemSchema) }),
          404: errorBody,
        },
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const document = await findDocumentForUser(app.prisma, request.params.documentId, user, {
        capability: 'manage_share',
      });
      if (!document) {
        return reply.code(404).send({ error: 'Document not found' });
      }

      const links = await app.prisma.documentShareLink.findMany({
        where: { documentId: document.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });

      const versionById = new Map(
        document.versions.map((v: { id: string; version: number }) => [v.id, v.version]),
      );

      return {
        items: links.map((link) => {
          const versionNum = versionById.get(link.versionId);
          const active = isShareLinkActive(link);
          return {
            id: link.id,
            versionId: link.versionId,
            version: typeof versionNum === 'number' ? versionNum : 0,
            expiresAt: link.expiresAt.toISOString(),
            revokedAt: link.revokedAt?.toISOString() ?? null,
            allowDownload: link.allowDownload,
            allowBookletZip: link.allowBookletZip,
            createdAt: link.createdAt.toISOString(),
            active,
            url: active ? resolveShareLinkUrl(env, link.tokenCipher) : null,
          };
        }),
      };
    },
  );

  r.delete(
    '/documents/:documentId/share-links/:linkId',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({
          documentId: z.string(),
          linkId: z.string(),
        }),
        response: {
          200: z.object({ ok: z.literal(true) }),
          404: errorBody,
        },
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const document = await findDocumentForUser(app.prisma, request.params.documentId, user, {
        capability: 'manage_share',
      });
      if (!document) {
        return reply.code(404).send({ error: 'Document not found' });
      }

      const link = await app.prisma.documentShareLink.findFirst({
        where: {
          id: request.params.linkId,
          documentId: document.id,
        },
      });
      if (!link) {
        return reply.code(404).send({ error: 'Share link not found' });
      }

      if (!link.revokedAt) {
        await app.prisma.documentShareLink.update({
          where: { id: link.id },
          data: { revokedAt: new Date() },
        });
        void publishShareLinkDocumentEvent(env, document.id, 'revoked', link.id).catch(
          (err) => {
            request.log.warn({ err }, 'share link revoked event publish failed');
          },
        );
        void app.prisma.auditLog.create({
          data: {
            action: 'document.share_revoke',
            userId: user.sub,
            tenantId: user.tenantId,
            documentId: document.id,
            meta: { shareLinkId: link.id },
          },
        });
      }

      return { ok: true as const };
    },
  );
};
