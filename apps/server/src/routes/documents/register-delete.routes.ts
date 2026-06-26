import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { deleteCachedSummaries } from '../../lib/ai/ai-cache.js';
import { findDocumentForUser, getAuthUser } from '../../lib/documents/document-access.js';
import type { Env } from '../../lib/config/env.js';
import {
  deleteDocumentArtifacts,
  deleteVersionArtifacts,
  isS3Configured,
} from '../../lib/storage/s3.js';
import { clearVersionLineageRefs } from './helpers.js';
import { errorBody } from './schemas.js';
export const registerDeleteRoutes: FastifyPluginAsync<{
  env: Env;
}> = async (app, opts) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const env = opts.env;
  r.delete(
    '/documents/:documentId/versions/:versionId',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ documentId: z.string(), versionId: z.string() }),
        response: {
          204: z.null(),
          400: errorBody,
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
      if (!version) {
        return reply.code(404).send({ error: 'Version not found' });
      }
      if (document.versions.length <= 1) {
        return reply.code(400).send({ error: 'Нельзя удалить единственную версию документа' });
      }
      await clearVersionLineageRefs(app.prisma, [versionId]);
      await deleteCachedSummaries(env, [versionId]);
      await app.prisma.documentAnnotation.deleteMany({ where: { versionId } });
      await app.prisma.aiSuggestion.deleteMany({ where: { versionId } });
      await app.prisma.documentVersion.delete({ where: { id: versionId } });
      if (isS3Configured()) {
        try {
          await deleteVersionArtifacts(documentId, versionId, version.s3Key);
        } catch (err) {
          request.log.warn(
            { err, documentId, versionId, s3Key: version.s3Key },
            'S3 cleanup incomplete for deleted version',
          );
        }
      }
      await app.prisma.auditLog.create({
        data: {
          action: 'document.version_delete',
          userId: user.sub,
          tenantId: user.tenantId,
          documentId,
          meta: { versionId },
        },
      });
      return reply.status(204).send(null);
    },
  );
  r.delete(
    '/documents/:documentId',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ documentId: z.string() }),
        response: {
          204: z.null(),
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
      const versionIds = document.versions.map((v: { id: string }) => v.id);
      await clearVersionLineageRefs(app.prisma, versionIds);
      await deleteCachedSummaries(env, versionIds);
      await app.prisma.documentAnnotation.deleteMany({ where: { documentId: document.id } });
      await app.prisma.aiSuggestion.deleteMany({ where: { documentId: document.id } });
      try {
        await app.prisma.document.delete({ where: { id: document.id } });
      } catch (err) {
        const missing =
          typeof err === 'object' &&
          err !== null &&
          'code' in err &&
          (
            err as {
              code: string;
            }
          ).code === 'P2025';
        if (!missing) throw err;
        return reply.status(204).send(null);
      }
      if (isS3Configured()) {
        try {
          await deleteDocumentArtifacts(document.id);
        } catch (err) {
          request.log.warn(
            { err, documentId: document.id },
            'S3 cleanup incomplete for deleted document',
          );
        }
      }
      await app.prisma.auditLog.create({
        data: {
          action: 'document.delete',
          userId: user.sub,
          tenantId: user.tenantId,
          meta: { documentId: document.id, title: document.title },
        },
      });
      return reply.status(204).send(null);
    },
  );
};
