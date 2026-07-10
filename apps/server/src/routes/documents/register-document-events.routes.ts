import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Env } from '../../lib/config/env.js';
import { findDocumentForUser, getAuthUser } from '../../lib/documents/document-access.js';
import { isDocumentEventsRedisConfigured } from '../../lib/events/document-events-bus.js';
import { streamDocumentScopeEvents } from '../../lib/events/sse.js';
import { errorBody } from './schemas.js';

export const registerDocumentEventsRoutes: FastifyPluginAsync<{ env: Env }> = async (app, { env }) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/documents/:documentId/versions/:versionId/events',
    {
      config: { rateLimit: false },
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ documentId: z.string(), versionId: z.string() }),
        response: {
          404: errorBody,
          503: errorBody,
        },
      },
    },
    async (request, reply) => {
      if (!isDocumentEventsRedisConfigured(env)) {
        return reply.code(503).send({ error: 'Live-обновления временно недоступны' });
      }

      const user = getAuthUser(request);
      const { documentId, versionId } = request.params;
      const document = await findDocumentForUser(app.prisma, documentId, user);
      if (!document) {
        return reply.code(404).send({ error: 'Document not found' });
      }
      if (!document.versions.some((v: { id: string }) => v.id === versionId)) {
        return reply.code(404).send({ error: 'Version not found' });
      }

      await streamDocumentScopeEvents({
        env,
        request,
        reply,
        documentId,
        versionId,
        includeDocumentMeta: true,
      });
    },
  );
};
