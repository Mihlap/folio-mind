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
  type S3DeleteResult,
} from '../../lib/storage/s3.js';
import { clearVersionLineageRefs } from './helpers.js';
import { errorBody } from './schemas.js';

function logS3CleanupIssues(
  log: {
    warn: (obj: unknown, msg?: string) => void;
    info?: (obj: unknown, msg?: string) => void;
  },
  result: S3DeleteResult,
  context: Record<string, unknown>,
  message: string,
): void {
  if (result.failed.length === 0) {
    log.info?.(
      { ...context, s3DeleteOk: result.deleted.length },
      'S3 cleanup completed for deleted version',
    );
    return;
  }
  log.warn({ ...context, s3DeleteFailed: result.failed, s3DeleteOk: result.deleted }, message);
}

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
      const versionStorage = {
        s3Key: version.s3Key,
        sourceDocxKey: version.sourceDocxKey,
      };
      if (isS3Configured()) {
        const result = await deleteVersionArtifacts(documentId, versionId, versionStorage, {
          versionNumber: version.version,
        });
        logS3CleanupIssues(
          request.log,
          result,
          { documentId, versionId, versionNumber: version.version },
          'S3 cleanup incomplete for deleted version',
        );
      }
      await clearVersionLineageRefs(app.prisma, [versionId]);
      await deleteCachedSummaries(env, [versionId]);
      await app.prisma.documentAnnotation.deleteMany({ where: { versionId } });
      await app.prisma.aiSuggestion.deleteMany({ where: { versionId } });
      await app.prisma.documentVersion.delete({ where: { id: versionId } });
      await app.prisma.auditLog.create({
        data: {
          action: 'document.version_delete',
          userId: user.sub,
          tenantId: user.tenantId,
          documentId,
          meta: { versionId, versionNumber: version.version },
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
      if (isS3Configured()) {
        const result = await deleteDocumentArtifacts(
          document.id,
          document.versions.map(
            (v: { id: string; s3Key: string; sourceDocxKey?: string | null; version: number }) => ({
              versionId: v.id,
              s3Key: v.s3Key,
              sourceDocxKey: v.sourceDocxKey,
              versionNumber: v.version,
            }),
          ),
        );
        logS3CleanupIssues(
          request.log,
          result,
          { documentId: document.id },
          'S3 cleanup incomplete for deleted document',
        );
      }
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
