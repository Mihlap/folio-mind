import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getAuthUser, findDocumentForUser } from '../lib/documents/document-access.js';
import { deleteDocumentWithArtifacts } from '../lib/documents/delete-document.js';
import type { Env } from '../lib/config/env.js';
import { findProjectForTenant } from '../lib/projects/project-access.js';
import { mapDocumentListItem } from './documents/helpers.js';
import { toDocumentReviewStatus } from '../lib/documents/document-review-status.js';
import { documentSchema, errorBody } from './documents/schemas.js';

const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  documentCount: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const projectRoutes: FastifyPluginAsync<{ env: Env }> = async (app, { env }) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/projects',
    {
      preHandler: [app.authenticate],
      schema: {
        response: {
          200: z.object({ items: z.array(projectSchema) }),
        },
      },
    },
    async (request) => {
      const user = getAuthUser(request);
      const items = await app.prisma.project.findMany({
        where: { tenantId: user.tenantId },
        orderBy: { updatedAt: 'desc' },
        include: { _count: { select: { documents: true } } },
      });
      return {
        items: items.map((p) => ({
          id: p.id,
          name: p.name,
          documentCount: p._count.documents,
          createdAt: p.createdAt.toISOString(),
          updatedAt: p.updatedAt.toISOString(),
        })),
      };
    },
  );

  r.post(
    '/projects',
    {
      preHandler: [app.authenticate],
      schema: {
        body: z.object({ name: z.string().trim().min(1).max(120) }),
        response: {
          201: projectSchema,
          400: errorBody,
        },
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const { name } = request.body;
      const project = await app.prisma.project.create({
        data: {
          name,
          tenantId: user.tenantId,
        },
        include: { _count: { select: { documents: true } } },
      });
      await app.prisma.auditLog.create({
        data: {
          action: 'project.create',
          userId: user.sub,
          tenantId: user.tenantId,
          meta: { projectId: project.id, name },
        },
      });
      return reply.status(201).send({
        id: project.id,
        name: project.name,
        documentCount: project._count.documents,
        createdAt: project.createdAt.toISOString(),
        updatedAt: project.updatedAt.toISOString(),
      });
    },
  );

  r.get(
    '/projects/:projectId',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ projectId: z.string() }),
        response: {
          200: z.object({
            project: projectSchema,
            documents: z.array(documentSchema),
          }),
          404: errorBody,
        },
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const project = await app.prisma.project.findFirst({
        where: { id: request.params.projectId, tenantId: user.tenantId },
        include: {
          _count: { select: { documents: true } },
          documents: {
            orderBy: { updatedAt: 'desc' },
            take: 100,
            include: {
              project: { select: { name: true } },
              versions: { orderBy: { version: 'desc' }, take: 1 },
            },
          },
        },
      });
      if (!project) {
        return reply.code(404).send({ error: 'Project not found' });
      }
      return {
        project: {
          id: project.id,
          name: project.name,
          documentCount: project._count.documents,
          createdAt: project.createdAt.toISOString(),
          updatedAt: project.updatedAt.toISOString(),
        },
        documents: project.documents.map((doc) =>
          mapDocumentListItem(doc, toDocumentReviewStatus),
        ),
      };
    },
  );

  r.patch(
    '/projects/:projectId',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ projectId: z.string() }),
        body: z.object({ name: z.string().trim().min(1).max(120) }),
        response: {
          200: projectSchema,
          404: errorBody,
        },
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const existing = await findProjectForTenant(
        app.prisma,
        request.params.projectId,
        user.tenantId,
      );
      if (!existing) {
        return reply.code(404).send({ error: 'Project not found' });
      }
      const project = await app.prisma.project.update({
        where: { id: existing.id },
        data: { name: request.body.name },
        include: { _count: { select: { documents: true } } },
      });
      return {
        id: project.id,
        name: project.name,
        documentCount: project._count.documents,
        createdAt: project.createdAt.toISOString(),
        updatedAt: project.updatedAt.toISOString(),
      };
    },
  );

  r.delete(
    '/projects/:projectId',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ projectId: z.string() }),
        response: {
          204: z.void(),
          403: errorBody,
          404: errorBody,
        },
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const existing = await findProjectForTenant(
        app.prisma,
        request.params.projectId,
        user.tenantId,
      );
      if (!existing) {
        return reply.code(404).send({ error: 'Project not found' });
      }

      const documents = await app.prisma.document.findMany({
        where: { projectId: existing.id, tenantId: user.tenantId },
        include: {
          versions: {
            orderBy: { version: 'asc' },
            select: { id: true, s3Key: true, sourceDocxKey: true, version: true },
          },
        },
      });

      for (const document of documents) {
        const manageable = await findDocumentForUser(app.prisma, document.id, user, {
          capability: 'manage',
        });
        if (!manageable) {
          return reply.code(403).send({
            error:
              'Нельзя удалить проект: в нём есть документы, которые вы не можете удалить. Отвяжите их от проекта («Без проекта») или попросите владельца удалить документы.',
          });
        }
      }

      for (const document of documents) {
        await deleteDocumentWithArtifacts(app.prisma, env, document, request.log);
        await app.prisma.auditLog.create({
          data: {
            action: 'document.delete',
            userId: user.sub,
            tenantId: user.tenantId,
            meta: {
              documentId: document.id,
              title: document.title,
              viaProjectDelete: existing.id,
            },
          },
        });
      }

      await app.prisma.project.delete({ where: { id: existing.id } });
      await app.prisma.auditLog.create({
        data: {
          action: 'project.delete',
          userId: user.sub,
          tenantId: user.tenantId,
          meta: {
            projectId: existing.id,
            name: existing.name,
            deletedDocumentCount: documents.length,
            deletedDocumentIds: documents.map((document) => document.id),
          },
        },
      });
      return reply.code(204).send();
    },
  );
};
