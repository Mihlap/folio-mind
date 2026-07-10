import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { findDocumentForUser, getAuthUser } from '../../lib/documents/document-access.js';
import { findProjectForTenant } from '../../lib/projects/project-access.js';
import { errorBody } from './schemas.js';

export const registerProjectRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.patch(
    '/documents/:documentId/project',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ documentId: z.string() }),
        body: z.object({ projectId: z.string().nullable() }),
        response: {
          200: z.object({
            id: z.string(),
            projectId: z.string().nullable(),
            projectName: z.string().nullable(),
          }),
          404: errorBody,
        },
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const document = await findDocumentForUser(app.prisma, request.params.documentId, user, { capability: 'edit' });
      if (!document) {
        return reply.code(404).send({ error: 'Document not found' });
      }

      const { projectId } = request.body;
      let projectName: string | null = null;

      if (projectId) {
        const project = await findProjectForTenant(app.prisma, projectId, user.tenantId);
        if (!project) {
          return reply.code(404).send({ error: 'Project not found' });
        }
        projectName = project.name;
      }

      const updated = await app.prisma.document.update({
        where: { id: document.id },
        data: { projectId },
        include: { project: { select: { name: true } } },
      });

      await app.prisma.project.updateMany({
        where: { id: { in: [projectId, document.projectId].filter(Boolean) as string[] } },
        data: { updatedAt: new Date() },
      });

      await app.prisma.auditLog.create({
        data: {
          action: 'document.project_change',
          userId: user.sub,
          tenantId: user.tenantId,
          documentId: document.id,
          meta: {
            fromProjectId: document.projectId,
            toProjectId: projectId,
          },
        },
      });

      return {
        id: updated.id,
        projectId: updated.projectId,
        projectName: updated.project?.name ?? projectName,
      };
    },
  );
};
