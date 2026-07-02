import { previewPageKeyForVariant } from '@folio-mind/pdf-contracts';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { fetchVersionPreviews } from '../lib/documents/fetch-version-previews.js';
import { guestPreviewPageUrl } from '../lib/share/guest-preview-url.js';
import {
  hashShareToken,
  isShareLinkActive,
} from '../lib/share/share-link.js';
import { resolveShareLinkByToken } from '../lib/share/resolve-share-link.js';
import type { Env } from '../lib/config/env.js';
import { getObjectWithBuffer, isS3Configured } from '../lib/storage/s3.js';
import { errorBody } from './documents/schemas.js';

export const PUBLIC_SHARE_RATE_LIMIT = {
  max: 60,
  timeWindow: '1 minute',
} as const;

export const publicShareRoutes: FastifyPluginAsync<{ env: Env }> = async (app, { env }) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/public/share/:token',
    {
      config: { rateLimit: PUBLIC_SHARE_RATE_LIMIT },
      schema: {
        params: z.object({ token: z.string().min(16) }),
        response: {
          200: z.object({
            title: z.string(),
            version: z.number(),
            pageCount: z.number().nullable(),
            expiresAt: z.string(),
            allowDownload: z.boolean(),
            previewStatus: z.enum(['processing', 'ready', 'partial', 'unavailable']),
          }),
          404: errorBody,
          410: errorBody,
          503: errorBody,
        },
      },
    },
    async (request, reply) => {
      if (!isS3Configured()) {
        return reply.code(503).send({ error: 'Просмотр временно недоступен' });
      }

      const resolved = await resolveShareLinkByToken(app.prisma, request.params.token);
      if (!resolved) {
        const existing = await app.prisma.documentShareLink.findUnique({
          where: { tokenHash: hashShareToken(request.params.token) },
        });
        if (existing && !isShareLinkActive(existing)) {
          return reply.code(410).send({ error: 'Ссылка истекла или отозвана' });
        }
        return reply.code(404).send({ error: 'Ссылка не найдена' });
      }

      void app.prisma.auditLog.create({
        data: {
          action: 'document.share_view',
          tenantId: resolved.document.tenantId,
          documentId: resolved.document.id,
          meta: {
            shareLinkId: resolved.link.id,
            versionId: resolved.link.versionId,
          },
        },
      });

      const previewStatus =
        resolved.version.status === 'processing'
          ? ('processing' as const)
          : resolved.version.pageCount === 0
            ? ('unavailable' as const)
            : ('ready' as const);

      return {
        title: resolved.document.title,
        version: resolved.version.version,
        pageCount: resolved.version.pageCount,
        expiresAt: resolved.link.expiresAt.toISOString(),
        allowDownload: resolved.link.allowDownload,
        previewStatus,
      };
    },
  );

  r.get(
    '/public/share/:token/previews',
    {
      config: { rateLimit: PUBLIC_SHARE_RATE_LIMIT },
      schema: {
        params: z.object({ token: z.string().min(16) }),
        querystring: z.object({
          from: z.coerce.number().int().min(1).optional(),
          to: z.coerce.number().int().min(1).optional(),
        }),
        response: {
          200: z.object({
            pageCount: z.number(),
            pages: z.array(
              z.object({
                page: z.number(),
                url: z.string(),
              }),
            ),
            status: z.enum(['processing', 'ready', 'partial', 'unavailable']),
            pendingPages: z.array(z.number()).optional(),
          }),
          404: errorBody,
          410: errorBody,
          503: errorBody,
        },
      },
    },
    async (request, reply) => {
      if (!isS3Configured()) {
        return reply.code(503).send({ error: 'Просмотр временно недоступен' });
      }

      const resolved = await resolveShareLinkByToken(app.prisma, request.params.token);
      if (!resolved) {
        return reply.code(404).send({ error: 'Ссылка не найдена или недействительна' });
      }

      const result = await fetchVersionPreviews({
        env,
        prisma: app.prisma,
        documentId: resolved.document.id,
        versionId: resolved.version.id,
        version: resolved.version,
        tenantId: resolved.document.tenantId,
        from: request.query.from,
        to: request.query.to,
        requestId: request.requestId,
        enqueueMissing: true,
        variant: 'view',
        allowThumbFallback: true,
      });

      const token = request.params.token;
      return {
        ...result,
        pages: result.pages.map((item) => ({
          page: item.page,
          url: guestPreviewPageUrl({ env, request, token, page: item.page }),
        })),
      };
    },
  );

  r.get(
    '/public/share/:token/pages/:page',
    {
      config: { rateLimit: PUBLIC_SHARE_RATE_LIMIT },
      schema: {
        params: z.object({
          token: z.string().min(16),
          page: z.coerce.number().int().min(1),
        }),
      },
    },
    async (request, reply) => {
      if (!isS3Configured()) {
        return reply.code(503).send({ error: 'Просмотр временно недоступен' });
      }

      const resolved = await resolveShareLinkByToken(app.prisma, request.params.token);
      if (!resolved) {
        return reply.code(404).send({ error: 'Ссылка не найдена или недействительна' });
      }

      const page = request.params.page;
      const maxPage = resolved.version.pageCount ?? 0;
      if (maxPage > 0 && page > maxPage) {
        return reply.code(404).send({ error: 'Страница не найдена' });
      }

      const viewKey = previewPageKeyForVariant(
        resolved.document.id,
        resolved.version.id,
        page,
        'view',
      );
      const thumbKey = previewPageKeyForVariant(
        resolved.document.id,
        resolved.version.id,
        page,
        'thumb',
      );
      try {
        const { buffer, contentType } = await getObjectWithBuffer(viewKey);
        return reply
          .header('Content-Type', contentType || 'image/png')
          .header('Cache-Control', 'private, max-age=300')
          .send(buffer);
      } catch {
        try {
          const { buffer, contentType } = await getObjectWithBuffer(thumbKey);
          return reply
            .header('Content-Type', contentType || 'image/png')
            .header('Cache-Control', 'private, max-age=120')
            .send(buffer);
        } catch {
          return reply.code(404).send({ error: 'Превью страницы ещё не готово' });
        }
      }
    },
  );
};
