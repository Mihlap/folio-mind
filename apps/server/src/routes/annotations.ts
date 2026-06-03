import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { findDocumentForUser, getAuthUser } from '../lib/documents/document-access.js';

const errorBody = z.object({ error: z.string() });

const annotationSchema = z.object({
  id: z.string(),
  documentId: z.string(),
  versionId: z.string(),
  userId: z.string(),
  page: z.number(),
  kind: z.string(),
  content: z.string(),
  quote: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const createAnnotationSchema = z.object({
  page: z.number().int().min(1),
  content: z.string().min(1).max(8000),
  kind: z.enum(['comment', 'highlight']).default('comment'),
  quote: z.string().max(4000).optional(),
});

export const annotationRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/documents/:documentId/versions/:versionId/annotations',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ documentId: z.string(), versionId: z.string() }),
        response: {
          200: z.object({ items: z.array(annotationSchema) }),
          404: errorBody,
        },
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const { documentId, versionId } = request.params;
      const document = await findDocumentForUser(app.prisma, documentId, user);
      if (!document) {
        return reply.code(404).send({ error: 'Document not found' });
      }
      if (!document.versions.some((v: { id: string }) => v.id === versionId)) {
        return reply.code(404).send({ error: 'Version not found' });
      }

      const items = await app.prisma.documentAnnotation.findMany({
        where: { documentId, versionId },
        orderBy: [{ page: 'asc' }, { createdAt: 'asc' }],
      });

      return {
        items: items.map((item) => ({
          id: item.id,
          documentId: item.documentId,
          versionId: item.versionId,
          userId: item.userId,
          page: item.page,
          kind: item.kind,
          content: item.content,
          quote: item.quote,
          createdAt: item.createdAt.toISOString(),
          updatedAt: item.updatedAt.toISOString(),
        })),
      };
    },
  );

  r.post(
    '/documents/:documentId/versions/:versionId/annotations',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ documentId: z.string(), versionId: z.string() }),
        body: createAnnotationSchema,
        response: {
          201: annotationSchema,
          404: errorBody,
        },
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const { documentId, versionId } = request.params;
      const document = await findDocumentForUser(app.prisma, documentId, user);
      if (!document) {
        return reply.code(404).send({ error: 'Document not found' });
      }
      const version = document.versions.find((v: { id: string }) => v.id === versionId);
      if (!version || version.status === 'pending_upload') {
        return reply.code(404).send({ error: 'Version not found' });
      }

      const created = await app.prisma.documentAnnotation.create({
        data: {
          documentId,
          versionId,
          userId: user.sub,
          page: request.body.page,
          kind: request.body.kind,
          content: request.body.content,
          quote: request.body.quote,
        },
      });

      await app.prisma.auditLog.create({
        data: {
          action: 'document.annotation_created',
          userId: user.sub,
          tenantId: user.tenantId,
          documentId,
          meta: { annotationId: created.id, versionId, page: created.page },
        },
      });

      return reply.status(201).send({
        id: created.id,
        documentId: created.documentId,
        versionId: created.versionId,
        userId: created.userId,
        page: created.page,
        kind: created.kind,
        content: created.content,
        quote: created.quote,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      });
    },
  );

  r.delete(
    '/documents/:documentId/versions/:versionId/annotations/:annotationId',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({
          documentId: z.string(),
          versionId: z.string(),
          annotationId: z.string(),
        }),
        response: { 204: z.null(), 404: errorBody, 403: errorBody },
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const { documentId, versionId, annotationId } = request.params;
      const document = await findDocumentForUser(app.prisma, documentId, user);
      if (!document) {
        return reply.code(404).send({ error: 'Document not found' });
      }

      const annotation = await app.prisma.documentAnnotation.findFirst({
        where: { id: annotationId, documentId, versionId },
      });
      if (!annotation) {
        return reply.code(404).send({ error: 'Annotation not found' });
      }
      if (annotation.userId !== user.sub) {
        return reply.code(403).send({ error: 'Можно удалить только свою заметку' });
      }

      await app.prisma.documentAnnotation.delete({ where: { id: annotationId } });
      await app.prisma.auditLog.create({
        data: {
          action: 'document.annotation_deleted',
          userId: user.sub,
          tenantId: user.tenantId,
          documentId,
          meta: { annotationId, versionId },
        },
      });

      return reply.status(204).send(null);
    },
  );
};
