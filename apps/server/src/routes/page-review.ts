import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Env } from '../lib/config/env.js';
import { findDocumentForUser, getAuthUser } from '../lib/documents/document-access.js';
import { publishPageReviewDocumentEvent } from '../lib/events/document-events-bus.js';
import { errorBody } from './documents/schemas.js';

export const pageReviewRoutes: FastifyPluginAsync<{ env: Env }> = async (app, { env }) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/documents/:documentId/versions/:versionId/page-review-marks',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ documentId: z.string(), versionId: z.string() }),
        response: {
          200: z.object({
            items: z.array(
              z.object({
                page: z.number(),
                status: z.enum(['ok', 'needs_fix']),
                updatedAt: z.string(),
              }),
            ),
          }),
          404: errorBody,
        },
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const document = await findDocumentForUser(app.prisma, request.params.documentId, user);
      if (!document) {
        return reply.code(404).send({ error: 'Document not found' });
      }
      const version = document.versions.find(
        (v: { id: string }) => v.id === request.params.versionId,
      );
      if (!version) {
        return reply.code(404).send({ error: 'Version not found' });
      }
      const items = await app.prisma.documentPageReviewMark.findMany({
        where: {
          documentId: document.id,
          versionId: version.id,
          tenantId: user.tenantId,
        },
        orderBy: { page: 'asc' },
      });
      return {
        items: items.map((item) => ({
          page: item.page,
          status: item.status as 'ok' | 'needs_fix',
          updatedAt: item.updatedAt.toISOString(),
        })),
      };
    },
  );

  r.put(
    '/documents/:documentId/versions/:versionId/page-review-marks/:page',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({
          documentId: z.string(),
          versionId: z.string(),
          page: z.coerce.number().int().positive(),
        }),
        body: z.object({ status: z.enum(['ok', 'needs_fix']).nullable() }),
        response: {
          200: z.object({ page: z.number(), status: z.enum(['ok', 'needs_fix']).nullable() }),
          404: errorBody,
        },
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const document = await findDocumentForUser(app.prisma, request.params.documentId, user);
      if (!document) {
        return reply.code(404).send({ error: 'Document not found' });
      }
      const version = document.versions.find(
        (v: { id: string }) => v.id === request.params.versionId,
      );
      if (!version) {
        return reply.code(404).send({ error: 'Version not found' });
      }

      const { page } = request.params;
      const { status } = request.body;

      if (status === null) {
        await app.prisma.documentPageReviewMark.deleteMany({
          where: {
            documentId: document.id,
            versionId: version.id,
            page,
            tenantId: user.tenantId,
          },
        });

        void publishPageReviewDocumentEvent(
          env,
          document.id,
          version.id,
          'cleared',
          page,
        ).catch((err) => {
          request.log.warn({ err }, 'page review event publish failed');
        });

        return { page, status: null };
      }

      await app.prisma.documentPageReviewMark.upsert({
        where: {
          documentId_versionId_page: {
            documentId: document.id,
            versionId: version.id,
            page,
          },
        },
        create: {
          documentId: document.id,
          versionId: version.id,
          page,
          status,
          tenantId: user.tenantId,
        },
        update: { status },
      });

      void publishPageReviewDocumentEvent(env, document.id, version.id, 'updated', page).catch(
        (err) => {
          request.log.warn({ err }, 'page review event publish failed');
        },
      );

      return { page, status };
    },
  );
};
