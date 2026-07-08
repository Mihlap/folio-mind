import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Env } from '../../../lib/config/env.js';
import { authenticateApiKey, generateApiKey, hashApiKey } from '../../../lib/api-keys/auth.js';
import { getAuthUser } from '../../../lib/documents/document-access.js';

export const apiV1Routes: FastifyPluginAsync<{ env: Env }> = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post(
    '/api/v1/api-keys',
    {
      preHandler: [app.authenticate],
      schema: {
        body: z.object({
          name: z.string().min(1).max(120),
          scopes: z.array(z.string()).default(['documents:read']),
        }),
        response: {
          201: z.object({
            id: z.string(),
            name: z.string(),
            apiKey: z.string(),
            scopes: z.array(z.string()),
          }),
        },
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const raw = generateApiKey();
      const row = await app.prisma.apiKey.create({
        data: {
          tenantId: user.tenantId,
          name: request.body.name,
          keyHash: hashApiKey(raw),
          scopes: request.body.scopes,
        },
      });
      return reply.status(201).send({
        id: row.id,
        name: row.name,
        apiKey: raw,
        scopes: row.scopes,
      });
    },
  );

  r.post(
    '/api/v1/webhooks',
    {
      preHandler: [app.authenticate],
      schema: {
        body: z.object({
          url: z.string().url(),
          secret: z.string().min(8).max(256),
          events: z.array(z.string()).default(['job.completed']),
        }),
        response: {
          201: z.object({ id: z.string(), url: z.string(), events: z.array(z.string()) }),
        },
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const row = await app.prisma.webhookEndpoint.create({
        data: {
          tenantId: user.tenantId,
          url: request.body.url,
          secret: request.body.secret,
          events: request.body.events,
        },
      });
      return reply.status(201).send({ id: row.id, url: row.url, events: row.events });
    },
  );

  r.get(
    '/api/v1/documents',
    {
      schema: {
        response: {
          200: z.object({
            items: z.array(
              z.object({
                id: z.string(),
                title: z.string(),
                updatedAt: z.string(),
              }),
            ),
          }),
          401: z.object({ error: z.string() }),
          403: z.object({ error: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const auth = await authenticateApiKey(app.prisma, request, reply);
      if (!auth) return;
      if (!auth.scopes.includes('documents:read') && !auth.scopes.includes('*')) {
        return reply.code(403).send({ error: 'Scope documents:read required' });
      }
      const docs = await app.prisma.document.findMany({
        where: { tenantId: auth.tenantId },
        orderBy: { updatedAt: 'desc' },
        take: 50,
        select: { id: true, title: true, updatedAt: true },
      });
      return {
        items: docs.map((d) => ({
          id: d.id,
          title: d.title,
          updatedAt: d.updatedAt.toISOString(),
        })),
      };
    },
  );

  r.get(
    '/api/v1/documents/:documentId',
    {
      schema: {
        params: z.object({ documentId: z.string() }),
        response: {
          200: z.object({
            id: z.string(),
            title: z.string(),
            versions: z.array(z.object({ id: z.string(), version: z.number(), status: z.string() })),
          }),
          401: z.object({ error: z.string() }),
          404: z.object({ error: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const auth = await authenticateApiKey(app.prisma, request, reply);
      if (!auth) return;
      const doc = await app.prisma.document.findFirst({
        where: { id: request.params.documentId, tenantId: auth.tenantId },
        include: {
          versions: { orderBy: { version: 'desc' }, select: { id: true, version: true, status: true } },
        },
      });
      if (!doc) {
        return reply.code(404).send({ error: 'Document not found' });
      }
      return {
        id: doc.id,
        title: doc.title,
        versions: doc.versions,
      };
    },
  );
};
