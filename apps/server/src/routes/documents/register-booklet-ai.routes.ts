import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { findDocumentForUser, getAuthUser } from '../../lib/documents/document-access.js';
import { findProjectForTenant } from '../../lib/projects/project-access.js';
import type { Env } from '../../lib/config/env.js';
import { enqueueAiJob } from '../../lib/queue/queue.js';
import { errorBody } from './schemas.js';

export const registerBookletAiRoutes: FastifyPluginAsync<{ env: Env }> = async (app, opts) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const env = opts.env;

  r.post(
    '/documents/:documentId/booklet-ai/title-draft',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ documentId: z.string() }),
        body: z.object({
          projectName: z.string().max(200).optional(),
          objectHint: z.string().max(500).optional(),
        }),
        response: {
          202: z.object({ jobId: z.string(), status: z.literal('processing') }),
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
      const version = document.versions.find((v: { status: string }) => v.status === 'ready');
      if (!version) {
        return reply.code(404).send({ error: 'Нет готовой версии документа' });
      }

      const job = await app.prisma.job.create({
        data: {
          type: 'booklet-title',
          status: 'queued',
          tenantId: user.tenantId,
          payload: {
            documentId: document.id,
            documentTitle: document.title,
            projectName: request.body.projectName,
            objectHint: request.body.objectHint,
          },
        },
      });

      await enqueueAiJob(env, {
        jobId: job.id,
        documentId: document.id,
        versionId: version.id,
        tenantId: user.tenantId,
        type: 'booklet-title',
        requestId: request.requestId,
      });

      return reply.status(202).send({ jobId: job.id, status: 'processing' });
    },
  );

  r.get(
    '/projects/:projectId/materials-search',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ projectId: z.string() }),
        querystring: z.object({ q: z.string().trim().min(1).max(120) }),
        response: {
          200: z.object({
            query: z.string(),
            documents: z.array(z.object({ id: z.string(), title: z.string() })),
            media: z.array(z.object({ id: z.string(), title: z.string(), fileName: z.string() })),
          }),
          404: errorBody,
        },
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const project = await findProjectForTenant(app.prisma, request.params.projectId, user.tenantId);
      if (!project) {
        return reply.code(404).send({ error: 'Project not found' });
      }

      const q = request.query.q;
      const like = { contains: q, mode: 'insensitive' as const };

      const projectDocs = await app.prisma.document.findMany({
        where: { tenantId: user.tenantId, projectId: project.id },
        select: { id: true, title: true },
        orderBy: { updatedAt: 'desc' },
      });
      const projectDocIds = projectDocs.map((doc) => doc.id);
      const documents = projectDocs
        .filter((doc) => doc.title.toLowerCase().includes(q.toLowerCase()))
        .slice(0, 20);

      const media =
        projectDocIds.length === 0
          ? []
          : await app.prisma.mediaAsset.findMany({
              where: {
                tenantId: user.tenantId,
                documentId: { in: projectDocIds },
                OR: [{ title: like }, { fileName: like }],
              },
              select: { id: true, title: true, fileName: true },
              orderBy: { updatedAt: 'desc' },
              take: 30,
            });

      return { query: q, documents, media };
    },
  );
};
