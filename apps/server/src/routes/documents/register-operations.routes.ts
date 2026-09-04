import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { findDocumentForUser, getAuthUser } from '../../lib/documents/document-access.js';
import {
  resolveReplaceCurrentTarget,
  validateReplaceCurrentAllowed,
} from '../../lib/documents/operation-save-target.js';
import { compareAcceptedEdits } from '../../lib/documents/compare-accepted-edits.js';
import {
  resolveEditSourceVersionId,
  resolveRootVersion,
} from '../../lib/documents/version-lineage.js';
import {
  buildVersionCompareResult,
  loadVersionPageTexts,
} from '../../lib/documents/version-compare.js';
import type { Env } from '../../lib/config/env.js';
import {
  enqueueApplyEditsFinalJob,
  enqueueApplyLayoutPdfJob,
  enqueueApplyVisualSignatureJob,
  enqueueExportFormDataJob,
  enqueueExportHighlightDocxJob,
  enqueueMergeVersionsJob,
  enqueueOptimizePdfJob,
  enqueueSplitPagesJob,
} from '../../lib/queue/queue.js';
import { isUserUploadedSourceDocxKey } from '@folio-mind/pdf-contracts';
import { isS3Configured } from '../../lib/storage/s3.js';
import { publishVersionCreatedDocumentEvent } from '../../lib/events/document-events-bus.js';
import { buildOriginalKey } from './helpers.js';
import {
  errorBody,
  applyLayoutPdfSchema,
  mergeVersionsSchema,
  optimizePdfSchema,
  rearrangePagesSchema,
  splitPagesSchema,
  versionCompareResponseSchema,
} from './schemas.js';
export const registerOperationsRoutes: FastifyPluginAsync<{
  env: Env;
}> = async (app, opts) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const env = opts.env;

  async function markVersionOperationEnqueueFailed(params: {
    operationJobId: string;
    targetVersionId: string;
    err: unknown;
    restoreReady?: boolean;
  }): Promise<void> {
    const message =
      params.err instanceof Error ? params.err.message : 'Failed to enqueue operation job';
    await app.prisma.$transaction([
      app.prisma.documentVersion.update({
        where: { id: params.targetVersionId },
        data: { status: params.restoreReady ? 'ready' : 'failed' },
      }),
      app.prisma.job.update({
        where: { id: params.operationJobId },
        data: { status: 'failed', payload: { error: message } },
      }),
    ]);
  }

  async function markJobEnqueueFailed(operationJobId: string, err: unknown): Promise<void> {
    const message = err instanceof Error ? err.message : 'Failed to enqueue operation job';
    await app.prisma.job.update({
      where: { id: operationJobId },
      data: { status: 'failed', payload: { error: message } },
    });
  }

  async function reserveNextVersionNumber(
    tx: Prisma.TransactionClient,
    documentId: string,
  ): Promise<number> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${documentId}))`;
    const latestVersion = await tx.documentVersion.findFirst({
      where: { documentId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    return (latestVersion?.version ?? 0) + 1;
  }
  r.post(
    '/documents/:documentId/versions/:versionId/operations/split',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({
          documentId: z.string(),
          versionId: z.string(),
        }),
        body: splitPagesSchema,
        response: {
          202: z.object({
            operationJobId: z.string(),
            versionId: z.string(),
            version: z.number(),
            status: z.literal('processing'),
          }),
          400: errorBody,
          404: errorBody,
          503: errorBody,
        },
      },
    },
    async (request, reply) => {
      if (!isS3Configured()) {
        return reply.code(503).send({ error: 'S3 is not configured' });
      }
      const user = getAuthUser(request);
      const { documentId, versionId } = request.params;
      const pages = [...request.body.pages].sort((a, b) => a - b);
      const document = await findDocumentForUser(app.prisma, documentId, user, { capability: 'edit' });
      if (!document) {
        return reply.code(404).send({ error: 'Document not found' });
      }
      const sourceVersion = document.versions.find((v: { id: string }) => v.id === versionId);
      if (!sourceVersion || sourceVersion.status !== 'ready') {
        return reply.code(400).send({ error: 'Source version is not ready' });
      }
      if (!sourceVersion.pageCount || sourceVersion.pageCount <= 0) {
        return reply.code(400).send({ error: 'Source version pageCount is unknown' });
      }
      if (pages[pages.length - 1]! > sourceVersion.pageCount) {
        return reply.code(400).send({ error: 'Page index out of range' });
      }
      const { targetVersion, operationJob, targetS3Key } = await app.prisma.$transaction(
        async (tx) => {
          const nextVersionNumber = await reserveNextVersionNumber(tx, document.id);
          const reservedTargetS3Key = buildOriginalKey(
            document.id,
            nextVersionNumber,
            `split-v${sourceVersion.version}.pdf`,
          );
          const version = await tx.documentVersion.create({
            data: {
              documentId: document.id,
              version: nextVersionNumber,
              s3Key: reservedTargetS3Key,
              size: BigInt(0),
              mimeType: sourceVersion.mimeType,
              status: 'processing',
            },
          });
          const job = await tx.job.create({
            data: {
              type: 'pdf-split',
              status: 'queued',
              tenantId: user.tenantId,
              payload: {
                documentId,
                sourceVersionId: sourceVersion.id,
                pages,
              },
            },
          });
          return { targetVersion: version, operationJob: job, targetS3Key: reservedTargetS3Key };
        },
      );
      try {
        await enqueueSplitPagesJob(env, {
          jobId: `split-pages-${targetVersion.id}`,
          operationJobId: operationJob.id,
          documentId,
          sourceVersionId: sourceVersion.id,
          targetVersionId: targetVersion.id,
          tenantId: user.tenantId,
          sourceS3Key: sourceVersion.s3Key,
          targetS3Key,
          pages,
          requestId: request.requestId,
        });
      } catch (err) {
        await markVersionOperationEnqueueFailed({
          operationJobId: operationJob.id,
          targetVersionId: targetVersion.id,
          err,
        });
        throw err;
      }
      await app.prisma.auditLog.create({
        data: {
          action: 'document.version_split',
          userId: user.sub,
          tenantId: user.tenantId,
          documentId,
          meta: {
            sourceVersionId: sourceVersion.id,
            targetVersionId: targetVersion.id,
            pages,
            operationJobId: operationJob.id,
          },
        },
      });
      void publishVersionCreatedDocumentEvent(env, document.id, targetVersion.id, targetVersion.version).catch((err) => {
        request.log.warn({ err }, 'version_created event publish failed');
      });
      return reply.status(202).send({
        operationJobId: operationJob.id,
        versionId: targetVersion.id,
        version: targetVersion.version,
        status: 'processing',
      });
    },
  );
  r.post(
    '/documents/:documentId/versions/:versionId/operations/rearrange-pages',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({
          documentId: z.string(),
          versionId: z.string(),
        }),
        body: rearrangePagesSchema,
        response: {
          202: z.object({
            operationJobId: z.string(),
            versionId: z.string(),
            version: z.number(),
            status: z.literal('processing'),
            replacedInPlace: z.boolean(),
          }),
          400: errorBody,
          404: errorBody,
          503: errorBody,
        },
      },
    },
    async (request, reply) => {
      if (!isS3Configured()) {
        return reply.code(503).send({ error: 'S3 is not configured' });
      }
      const user = getAuthUser(request);
      const { documentId, versionId } = request.params;
      const { pages, saveMode } = request.body;
      const pageList = [...pages];
      const document = await findDocumentForUser(app.prisma, documentId, user, { capability: 'edit' });
      if (!document) {
        return reply.code(404).send({ error: 'Document not found' });
      }
      const sourceVersion = document.versions.find((v: { id: string }) => v.id === versionId);
      if (!sourceVersion || sourceVersion.status !== 'ready') {
        return reply.code(400).send({ error: 'Source version is not ready' });
      }
      if (!sourceVersion.pageCount || sourceVersion.pageCount <= 0) {
        return reply.code(400).send({ error: 'Source version pageCount is unknown' });
      }
      for (const page of pageList) {
        if (page === 0) continue;
        if (page > sourceVersion.pageCount) {
          return reply.code(400).send({ error: 'Page index out of range' });
        }
      }

      const replaceInPlace = saveMode === 'replace_current';
      if (replaceInPlace) {
        const replaceError = validateReplaceCurrentAllowed(document.versions[0], sourceVersion.id);
        if (replaceError) {
          return reply.code(400).send({ error: replaceError });
        }
      }

      const operationResult = await app.prisma.$transaction(async (tx) => {
        let targetS3Key = sourceVersion.s3Key;
        let targetVersionNumber = sourceVersion.version;
        let targetVersionId = sourceVersion.id;
        if (replaceInPlace) {
          const saveTarget = resolveReplaceCurrentTarget(sourceVersion);
          const locked = await tx.documentVersion.updateMany({
            where: { id: sourceVersion.id, status: 'ready' },
            data: { status: 'processing' },
          });
          if (locked.count !== 1) return null;
          targetS3Key = saveTarget.targetS3Key;
          targetVersionNumber = saveTarget.targetVersionNumber;
          targetVersionId = saveTarget.targetVersionId!;
        }
        const version = replaceInPlace
          ? { id: targetVersionId, version: targetVersionNumber }
          : await (async () => {
              const nextVersionNumber = await reserveNextVersionNumber(tx, document.id);
              const reservedTargetS3Key = buildOriginalKey(
                document.id,
                nextVersionNumber,
                `reorder-v${sourceVersion.version}.pdf`,
              );
              targetS3Key = reservedTargetS3Key;
              return tx.documentVersion.create({
                data: {
                  documentId: document.id,
                  version: nextVersionNumber,
                  s3Key: reservedTargetS3Key,
                  size: BigInt(0),
                  mimeType: sourceVersion.mimeType,
                  status: 'processing',
                  sourceVersionId: sourceVersion.id,
                },
              });
            })();
        const job = await tx.job.create({
          data: {
            type: 'pdf-rearrange',
            status: 'queued',
            tenantId: user.tenantId,
            payload: {
              documentId,
              sourceVersionId: sourceVersion.id,
              pages: pageList,
              replaceInPlace,
            },
          },
        });
        return { targetVersion: version, operationJob: job, targetS3Key };
      });
      if (!operationResult) {
        return reply.code(400).send({ error: 'Source version is not ready' });
      }
      const { targetVersion, operationJob, targetS3Key } = operationResult;

      try {
        await enqueueSplitPagesJob(env, {
          jobId: `rearrange-pages-${operationJob.id}`,
          operationJobId: operationJob.id,
          documentId,
          sourceVersionId: sourceVersion.id,
          targetVersionId: targetVersion.id,
          tenantId: user.tenantId,
          sourceS3Key: sourceVersion.s3Key,
          targetS3Key,
          pages: pageList,
          replaceInPlace,
          requestId: request.requestId,
        });
      } catch (err) {
        await markVersionOperationEnqueueFailed({
          operationJobId: operationJob.id,
          targetVersionId: targetVersion.id,
          err,
          restoreReady: replaceInPlace,
        });
        throw err;
      }
      await app.prisma.auditLog.create({
        data: {
          action: 'document.version_rearrange_pages',
          userId: user.sub,
          tenantId: user.tenantId,
          documentId,
          meta: {
            sourceVersionId: sourceVersion.id,
            targetVersionId: targetVersion.id,
            pages: pageList,
            replaceInPlace,
            operationJobId: operationJob.id,
          },
        },
      });
      if (!replaceInPlace) {
        void publishVersionCreatedDocumentEvent(env, document.id, targetVersion.id, targetVersion.version).catch((err) => {
          request.log.warn({ err }, 'version_created event publish failed');
        });
      }
      return reply.status(202).send({
        operationJobId: operationJob.id,
        versionId: targetVersion.id,
        version: targetVersion.version,
        status: 'processing',
        replacedInPlace: replaceInPlace,
      });
    },
  );
  r.post(
    '/documents/:documentId/operations/merge',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({
          documentId: z.string(),
        }),
        body: mergeVersionsSchema,
        response: {
          202: z.object({
            operationJobId: z.string(),
            versionId: z.string(),
            version: z.number(),
            status: z.literal('processing'),
          }),
          400: errorBody,
          404: errorBody,
          503: errorBody,
        },
      },
    },
    async (request, reply) => {
      if (!isS3Configured()) {
        return reply.code(503).send({ error: 'S3 is not configured' });
      }
      const user = getAuthUser(request);
      const { documentId } = request.params;
      const { versionIds } = request.body;
      const document = await findDocumentForUser(app.prisma, documentId, user, { capability: 'edit' });
      if (!document) {
        return reply.code(404).send({ error: 'Document not found' });
      }
      const sourceVersions = versionIds.map((id) => {
        const version = document.versions.find((v: { id: string }) => v.id === id);
        return version ?? null;
      });
      if (sourceVersions.some((v) => v === null)) {
        return reply.code(400).send({ error: 'One or more versions not found on this document' });
      }
      const readyVersions = sourceVersions as NonNullable<(typeof sourceVersions)[number]>[];
      if (readyVersions.some((v) => v.status !== 'ready')) {
        return reply.code(400).send({ error: 'All source versions must be ready' });
      }
      if (readyVersions.some((v) => !v.pageCount || v.pageCount <= 0)) {
        return reply.code(400).send({ error: 'Source version pageCount is unknown' });
      }
      const totalPages = readyVersions.reduce((sum, v) => sum + (v.pageCount ?? 0), 0);
      const { targetVersion, operationJob, targetS3Key } = await app.prisma.$transaction(
        async (tx) => {
          const nextVersionNumber = await reserveNextVersionNumber(tx, document.id);
          const reservedTargetS3Key = buildOriginalKey(
            document.id,
            nextVersionNumber,
            `merge-v${readyVersions.map((v) => v.version).join('-')}.pdf`,
          );
          const version = await tx.documentVersion.create({
            data: {
              documentId: document.id,
              version: nextVersionNumber,
              s3Key: reservedTargetS3Key,
              size: BigInt(0),
              mimeType: readyVersions[0]!.mimeType,
              status: 'processing',
            },
          });
          const job = await tx.job.create({
            data: {
              type: 'pdf-merge',
              status: 'queued',
              tenantId: user.tenantId,
              payload: {
                documentId,
                sourceVersionIds: versionIds,
              },
            },
          });
          return { targetVersion: version, operationJob: job, targetS3Key: reservedTargetS3Key };
        },
      );
      try {
        await enqueueMergeVersionsJob(env, {
          jobId: `merge-versions-${targetVersion.id}`,
          operationJobId: operationJob.id,
          documentId,
          targetVersionId: targetVersion.id,
          tenantId: user.tenantId,
          sourceS3Keys: readyVersions.map((v) => v.s3Key),
          sourceVersionIds: versionIds,
          targetS3Key,
          requestId: request.requestId,
        });
      } catch (err) {
        await markVersionOperationEnqueueFailed({
          operationJobId: operationJob.id,
          targetVersionId: targetVersion.id,
          err,
        });
        throw err;
      }
      await app.prisma.auditLog.create({
        data: {
          action: 'document.versions_merged',
          userId: user.sub,
          tenantId: user.tenantId,
          documentId,
          meta: {
            sourceVersionIds: versionIds,
            targetVersionId: targetVersion.id,
            operationJobId: operationJob.id,
            pageCount: totalPages,
          },
        },
      });
      void publishVersionCreatedDocumentEvent(env, document.id, targetVersion.id, targetVersion.version).catch((err) => {
        request.log.warn({ err }, 'version_created event publish failed');
      });
      return reply.status(202).send({
        operationJobId: operationJob.id,
        versionId: targetVersion.id,
        version: targetVersion.version,
        status: 'processing',
      });
    },
  );
  r.get(
    '/documents/:documentId/versions/compare',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ documentId: z.string() }),
        querystring: z.object({
          baseVersionId: z.string().min(1),
          compareVersionId: z.string().min(1),
        }),
        response: {
          200: versionCompareResponseSchema,
          400: errorBody,
          404: errorBody,
          409: errorBody,
          503: errorBody,
        },
      },
    },
    async (request, reply) => {
      if (!isS3Configured()) {
        return reply.code(503).send({ error: 'S3 is not configured' });
      }
      const user = getAuthUser(request);
      const { documentId } = request.params;
      const { baseVersionId, compareVersionId } = request.query;
      if (baseVersionId === compareVersionId) {
        return reply.code(400).send({ error: 'Выберите две разные версии' });
      }
      const document = await findDocumentForUser(app.prisma, documentId, user, { capability: 'view' });
      if (!document) {
        return reply.code(404).send({ error: 'Document not found' });
      }
      const baseVersion = document.versions.find((v: { id: string }) => v.id === baseVersionId);
      const compareVersion = document.versions.find(
        (v: { id: string }) => v.id === compareVersionId,
      );
      if (!baseVersion || !compareVersion) {
        return reply.code(404).send({ error: 'Version not found' });
      }
      if (baseVersion.status !== 'ready' || compareVersion.status !== 'ready') {
        return reply.code(400).send({ error: 'Сравнение доступно только для готовых версий' });
      }
      const [basePages, comparePages] = await Promise.all([
        loadVersionPageTexts(documentId, baseVersionId),
        loadVersionPageTexts(documentId, compareVersionId),
      ]);
      if (!basePages || !comparePages) {
        return reply.code(409).send({
          error:
            'Текст версий ещё не извлечён. Дождитесь завершения обработки или откройте документ позже.',
        });
      }
      const [baseEditRows, compareEditRows] = await Promise.all([
        app.prisma.documentAnnotation.findMany({
          where: { documentId, versionId: baseVersionId, kind: 'accepted_edit' },
          select: { page: true, quote: true, content: true, meta: true },
          orderBy: [{ page: 'asc' }, { createdAt: 'asc' }],
        }),
        app.prisma.documentAnnotation.findMany({
          where: { documentId, versionId: compareVersionId, kind: 'accepted_edit' },
          select: { page: true, quote: true, content: true, meta: true },
          orderBy: [{ page: 'asc' }, { createdAt: 'asc' }],
        }),
      ]);
      const editedPages = new Set([...baseEditRows, ...compareEditRows].map((row) => row.page));
      const strictCompare = Boolean(
        (baseVersion as { confidenceLevel?: string | null }).confidenceLevel ||
        (compareVersion as { confidenceLevel?: string | null }).confidenceLevel,
      );
      const diff = buildVersionCompareResult(basePages, comparePages, {
        editedPages,
        strict: strictCompare,
      });
      const acceptedEdits = compareAcceptedEdits(baseEditRows, compareEditRows);
      await app.prisma.auditLog.create({
        data: {
          action: 'document.versions_compared',
          userId: user.sub,
          tenantId: user.tenantId,
          documentId,
          meta: {
            baseVersionId,
            compareVersionId,
            summary: diff.summary,
          },
        },
      });
      return {
        baseVersionId,
        compareVersionId,
        baseVersion: baseVersion.version,
        compareVersion: compareVersion.version,
        summary: diff.summary,
        pages: diff.pages,
        acceptedEdits,
        pageCount: {
          base: baseVersion.pageCount ?? null,
          compare: compareVersion.pageCount ?? null,
        },
      };
    },
  );
  r.post(
    '/documents/:documentId/versions/:versionId/operations/apply-edits-final',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ documentId: z.string(), versionId: z.string() }),
        response: {
          202: z.object({
            operationJobId: z.string(),
            versionId: z.string(),
            version: z.number(),
            status: z.literal('processing'),
          }),
          400: errorBody,
          404: errorBody,
          503: errorBody,
        },
      },
    },
    async (request, reply) => {
      if (!isS3Configured()) {
        return reply.code(503).send({ error: 'S3 is not configured' });
      }
      const user = getAuthUser(request);
      const { documentId, versionId } = request.params;
      const document = await findDocumentForUser(app.prisma, documentId, user, { capability: 'edit' });
      if (!document) {
        return reply.code(404).send({ error: 'Document not found' });
      }
      const sourceVersion = document.versions.find((v: { id: string }) => v.id === versionId);
      if (!sourceVersion || sourceVersion.status !== 'ready') {
        return reply.code(400).send({ error: 'Source version is not ready' });
      }
      const versionRows = document.versions.map(
        (v: {
          id: string;
          sourceVersionId: string | null;
          s3Key: string;
          sourceDocxKey: string | null;
        }) => ({
          id: v.id,
          sourceVersionId: v.sourceVersionId,
          s3Key: v.s3Key,
          sourceDocxKey: v.sourceDocxKey,
        }),
      );
      const editSourceVersionId = await resolveEditSourceVersionId(
        app.prisma,
        documentId,
        versionId,
      );
      const rootVersion = resolveRootVersion(versionRows, versionId);
      const resolvedSourceS3Key = rootVersion.s3Key;
      const editSourceVersion = document.versions.find(
        (v: { id: string }) => v.id === editSourceVersionId,
      );
      const editSourceS3Key = editSourceVersion?.s3Key ?? resolvedSourceS3Key;
      const userSourceDocxKey = isUserUploadedSourceDocxKey(rootVersion.sourceDocxKey)
        ? rootVersion.sourceDocxKey
        : null;
      const [acceptedAiCount, manualEditsCount] = await Promise.all([
        app.prisma.aiSuggestion.count({
          where: {
            documentId,
            versionId: editSourceVersionId,
            tenantId: user.tenantId,
            status: 'accepted',
          },
        }),
        app.prisma.documentAnnotation.count({
          where: { documentId, versionId: editSourceVersionId, kind: 'accepted_edit' },
        }),
      ]);
      if (acceptedAiCount === 0 && manualEditsCount === 0) {
        return reply.code(400).send({
          error: 'Нет принятых правок для применения',
        });
      }
      const { targetVersion, operationJob, targetS3Key } = await app.prisma.$transaction(
        async (tx) => {
          const nextVersionNumber = await reserveNextVersionNumber(tx, document.id);
          const reservedTargetS3Key = buildOriginalKey(
            document.id,
            nextVersionNumber,
            `final-v${sourceVersion.version}.pdf`,
          );
          const version = await tx.documentVersion.create({
            data: {
              documentId: document.id,
              version: nextVersionNumber,
              s3Key: reservedTargetS3Key,
              size: BigInt(0),
              mimeType: sourceVersion.mimeType,
              status: 'processing',
              sourceVersionId: sourceVersion.id,
            },
          });
          const job = await tx.job.create({
            data: {
              type: 'apply-edits-final',
              status: 'queued',
              tenantId: user.tenantId,
              payload: {
                documentId,
                sourceVersionId: sourceVersion.id,
                editSourceVersionId,
                rootVersionId: rootVersion.id,
                acceptedAiCount,
                manualEditsCount,
                userSourceDocxKey,
              },
            },
          });
          return { targetVersion: version, operationJob: job, targetS3Key: reservedTargetS3Key };
        },
      );
      try {
        await enqueueApplyEditsFinalJob(env, {
          jobId: `apply-edits-final-${targetVersion.id}`,
          operationJobId: operationJob.id,
          documentId,
          editSourceVersionId,
          rootVersionId: rootVersion.id,
          sourceVersionId: sourceVersion.id,
          targetVersionId: targetVersion.id,
          tenantId: user.tenantId,
          sourceS3Key: resolvedSourceS3Key,
          editSourceS3Key,
          targetS3Key,
          userSourceDocxKey,
          requestId: request.requestId,
        });
      } catch (err) {
        await markVersionOperationEnqueueFailed({
          operationJobId: operationJob.id,
          targetVersionId: targetVersion.id,
          err,
        });
        throw err;
      }
      await app.prisma.auditLog.create({
        data: {
          action: 'document.version_apply_edits_final',
          userId: user.sub,
          tenantId: user.tenantId,
          documentId,
          meta: {
            sourceVersionId: sourceVersion.id,
            targetVersionId: targetVersion.id,
            acceptedAiCount,
            manualEditsCount,
            operationJobId: operationJob.id,
          },
        },
      });
      void publishVersionCreatedDocumentEvent(env, document.id, targetVersion.id, targetVersion.version).catch((err) => {
        request.log.warn({ err }, 'version_created event publish failed');
      });
      return reply.status(202).send({
        operationJobId: operationJob.id,
        versionId: targetVersion.id,
        version: targetVersion.version,
        status: 'processing',
      });
    },
  );
  r.post(
    '/documents/:documentId/versions/:versionId/operations/optimize-pdf',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({
          documentId: z.string(),
          versionId: z.string(),
        }),
        body: optimizePdfSchema,
        response: {
          202: z.object({
            operationJobId: z.string(),
            versionId: z.string(),
            version: z.number(),
            status: z.literal('processing'),
          }),
          400: errorBody,
          404: errorBody,
          503: errorBody,
        },
      },
    },
    async (request, reply) => {
      if (!isS3Configured()) {
        return reply.code(503).send({ error: 'S3 is not configured' });
      }
      const user = getAuthUser(request);
      const { documentId, versionId } = request.params;
      const { preset } = request.body;
      const document = await findDocumentForUser(app.prisma, documentId, user, { capability: 'edit' });
      if (!document) {
        return reply.code(404).send({ error: 'Document not found' });
      }
      const sourceVersion = document.versions.find((v: { id: string }) => v.id === versionId);
      if (!sourceVersion || sourceVersion.status !== 'ready') {
        return reply.code(400).send({ error: 'Source version is not ready' });
      }
      if (!sourceVersion.pageCount || sourceVersion.pageCount <= 0) {
        return reply.code(400).send({ error: 'Source version pageCount is unknown' });
      }
      if (sourceVersion.pageCount > 200) {
        return reply.code(400).send({ error: 'Оптимизация поддерживает PDF до 200 страниц' });
      }
      const { targetVersion, operationJob, targetS3Key } = await app.prisma.$transaction(
        async (tx) => {
          const nextVersionNumber = await reserveNextVersionNumber(tx, document.id);
          const reservedTargetS3Key = buildOriginalKey(
            document.id,
            nextVersionNumber,
            `optimized-${preset}-v${sourceVersion.version}.pdf`,
          );
          const version = await tx.documentVersion.create({
            data: {
              documentId: document.id,
              version: nextVersionNumber,
              s3Key: reservedTargetS3Key,
              size: BigInt(0),
              mimeType: sourceVersion.mimeType,
              status: 'processing',
              sourceVersionId: sourceVersion.id,
            },
          });
          const job = await tx.job.create({
            data: {
              type: 'optimize-pdf',
              status: 'queued',
              tenantId: user.tenantId,
              payload: {
                documentId,
                sourceVersionId: sourceVersion.id,
                preset,
              },
            },
          });
          return { targetVersion: version, operationJob: job, targetS3Key: reservedTargetS3Key };
        },
      );
      try {
        await enqueueOptimizePdfJob(env, {
          jobId: `optimize-pdf-${targetVersion.id}`,
          operationJobId: operationJob.id,
          documentId,
          sourceVersionId: sourceVersion.id,
          targetVersionId: targetVersion.id,
          tenantId: user.tenantId,
          sourceS3Key: sourceVersion.s3Key,
          targetS3Key,
          preset,
          requestId: request.requestId,
        });
      } catch (err) {
        await markVersionOperationEnqueueFailed({
          operationJobId: operationJob.id,
          targetVersionId: targetVersion.id,
          err,
        });
        throw err;
      }
      await app.prisma.auditLog.create({
        data: {
          action: 'document.version_optimize_pdf',
          userId: user.sub,
          tenantId: user.tenantId,
          documentId,
          meta: {
            sourceVersionId: sourceVersion.id,
            targetVersionId: targetVersion.id,
            preset,
            operationJobId: operationJob.id,
          },
        },
      });
      void publishVersionCreatedDocumentEvent(env, document.id, targetVersion.id, targetVersion.version).catch((err) => {
        request.log.warn({ err }, 'version_created event publish failed');
      });
      return reply.status(202).send({
        operationJobId: operationJob.id,
        versionId: targetVersion.id,
        version: targetVersion.version,
        status: 'processing',
      });
    },
  );
  r.post(
    '/documents/:documentId/versions/:versionId/operations/apply-layout-pdf',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({
          documentId: z.string(),
          versionId: z.string(),
        }),
        body: applyLayoutPdfSchema,
        response: {
          202: z.object({
            operationJobId: z.string(),
            versionId: z.string(),
            version: z.number(),
            status: z.literal('processing'),
            replacedInPlace: z.boolean(),
          }),
          400: errorBody,
          404: errorBody,
          503: errorBody,
        },
      },
    },
    async (request, reply) => {
      if (!isS3Configured()) {
        return reply.code(503).send({ error: 'S3 is not configured' });
      }
      const user = getAuthUser(request);
      const { documentId, versionId } = request.params;
      const { objects, blankInsertions, pageChrome, saveMode } = request.body;
      const document = await findDocumentForUser(app.prisma, documentId, user, { capability: 'edit' });
      if (!document) {
        return reply.code(404).send({ error: 'Document not found' });
      }
      const sourceVersion = document.versions.find((v: { id: string }) => v.id === versionId);
      if (!sourceVersion || sourceVersion.status !== 'ready') {
        return reply.code(400).send({ error: 'Source version is not ready' });
      }
      if (!sourceVersion.pageCount || sourceVersion.pageCount <= 0) {
        return reply.code(400).send({ error: 'Source version pageCount is unknown' });
      }
      const maxPage = objects.reduce((max, object) => Math.max(max, object.page), 0);
      const insertedPages = blankInsertions.reduce((sum, item) => sum + item.count, 0);
      const extraPages = Math.max(0, maxPage - sourceVersion.pageCount) + insertedPages;
      if (extraPages > 50) {
        return reply
          .code(400)
          .send({ error: 'Слишком много новых страниц для макета (максимум +50)' });
      }

      const replaceInPlace = saveMode === 'replace_current';
      if (replaceInPlace) {
        const replaceError = validateReplaceCurrentAllowed(document.versions[0], sourceVersion.id);
        if (replaceError) {
          return reply.code(400).send({ error: replaceError });
        }
      }

      const operationResult = await app.prisma.$transaction(async (tx) => {
        let targetS3Key = sourceVersion.s3Key;
        let targetVersionNumber = sourceVersion.version;
        let targetVersionId = sourceVersion.id;
        if (replaceInPlace) {
          const saveTarget = resolveReplaceCurrentTarget(sourceVersion);
          const locked = await tx.documentVersion.updateMany({
            where: { id: sourceVersion.id, status: 'ready' },
            data: { status: 'processing' },
          });
          if (locked.count !== 1) return null;
          targetS3Key = saveTarget.targetS3Key;
          targetVersionNumber = saveTarget.targetVersionNumber;
          targetVersionId = saveTarget.targetVersionId!;
        }
        const version = replaceInPlace
          ? { id: targetVersionId, version: targetVersionNumber }
          : await (async () => {
              const nextVersionNumber = await reserveNextVersionNumber(tx, document.id);
              const reservedTargetS3Key = buildOriginalKey(
                document.id,
                nextVersionNumber,
                `layout-v${sourceVersion.version}.pdf`,
              );
              targetS3Key = reservedTargetS3Key;
              return tx.documentVersion.create({
                data: {
                  documentId: document.id,
                  version: nextVersionNumber,
                  s3Key: reservedTargetS3Key,
                  size: BigInt(0),
                  mimeType: sourceVersion.mimeType,
                  status: 'processing',
                  sourceVersionId: sourceVersion.id,
                },
              });
            })();
        const job = await tx.job.create({
          data: {
            type: 'apply-layout-pdf',
            status: 'queued',
            tenantId: user.tenantId,
            payload: {
              documentId,
              sourceVersionId: sourceVersion.id,
              objectCount: objects.length,
              replaceInPlace,
            },
          },
        });
        return { targetVersion: version, operationJob: job, targetS3Key };
      });
      if (!operationResult) {
        return reply.code(400).send({ error: 'Source version is not ready' });
      }
      const { targetVersion, operationJob, targetS3Key } = operationResult;

      try {
        await enqueueApplyLayoutPdfJob(env, {
          jobId: `apply-layout-pdf-${operationJob.id}`,
          operationJobId: operationJob.id,
          documentId,
          sourceVersionId: sourceVersion.id,
          targetVersionId: targetVersion.id,
          tenantId: user.tenantId,
          sourceS3Key: sourceVersion.s3Key,
          targetS3Key,
          layoutObjects: objects,
          blankInsertions,
          pageChrome,
          replaceInPlace,
          requestId: request.requestId,
        });
      } catch (err) {
        await markVersionOperationEnqueueFailed({
          operationJobId: operationJob.id,
          targetVersionId: targetVersion.id,
          err,
          restoreReady: replaceInPlace,
        });
        throw err;
      }
      await app.prisma.auditLog.create({
        data: {
          action: 'document.version_apply_layout_pdf',
          userId: user.sub,
          tenantId: user.tenantId,
          documentId,
          meta: {
            sourceVersionId: sourceVersion.id,
            targetVersionId: targetVersion.id,
            objectCount: objects.length,
            extraPages,
            replaceInPlace,
            operationJobId: operationJob.id,
          },
        },
      });
      if (!replaceInPlace) {
        void publishVersionCreatedDocumentEvent(env, document.id, targetVersion.id, targetVersion.version).catch((err) => {
          request.log.warn({ err }, 'version_created event publish failed');
        });
      }
      return reply.status(202).send({
        operationJobId: operationJob.id,
        versionId: targetVersion.id,
        version: targetVersion.version,
        status: 'processing',
        replacedInPlace: replaceInPlace,
      });
    },
  );
  r.post(
    '/documents/:documentId/versions/:versionId/operations/export-highlight-docx',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ documentId: z.string(), versionId: z.string() }),
        response: {
          202: z.object({ operationJobId: z.string(), status: z.literal('processing') }),
          400: errorBody,
          404: errorBody,
          503: errorBody,
        },
      },
    },
    async (request, reply) => {
      if (!isS3Configured()) {
        return reply.code(503).send({ error: 'S3 is not configured' });
      }
      const user = getAuthUser(request);
      const { documentId, versionId } = request.params;
      const document = await findDocumentForUser(app.prisma, documentId, user, { capability: 'edit' });
      if (!document) {
        return reply.code(404).send({ error: 'Document not found' });
      }
      const sourceVersion = document.versions.find((v: { id: string }) => v.id === versionId);
      if (!sourceVersion || sourceVersion.status !== 'ready') {
        return reply.code(400).send({ error: 'Source version is not ready' });
      }
      const versionRows = document.versions.map(
        (v: {
          id: string;
          sourceVersionId: string | null;
          s3Key: string;
          sourceDocxKey: string | null;
        }) => ({
          id: v.id,
          sourceVersionId: v.sourceVersionId,
          s3Key: v.s3Key,
          sourceDocxKey: v.sourceDocxKey,
        }),
      );
      const rootVersion = resolveRootVersion(versionRows, versionId);
      const userSourceDocxKey = isUserUploadedSourceDocxKey(rootVersion.sourceDocxKey)
        ? rootVersion.sourceDocxKey
        : null;
      const [acceptedAiCount, manualEditsCount] = await Promise.all([
        app.prisma.aiSuggestion.count({
          where: { documentId, versionId, tenantId: user.tenantId, status: 'accepted' },
        }),
        app.prisma.documentAnnotation.count({
          where: { documentId, versionId, kind: 'accepted_edit' },
        }),
      ]);
      if (acceptedAiCount === 0 && manualEditsCount === 0) {
        return reply.code(400).send({ error: 'Нет принятых правок для экспорта' });
      }
      const operationJob = await app.prisma.job.create({
        data: {
          type: 'export-highlight-docx',
          status: 'queued',
          tenantId: user.tenantId,
          payload: { documentId, versionId, rootVersionId: rootVersion.id },
        },
      });
      try {
        await enqueueExportHighlightDocxJob(env, {
          jobId: `export-highlight-docx-${operationJob.id}`,
          operationJobId: operationJob.id,
          documentId,
          versionId,
          rootVersionId: rootVersion.id,
          tenantId: user.tenantId,
          sourceS3Key: rootVersion.s3Key,
          userSourceDocxKey,
          requestId: request.requestId,
        });
      } catch (err) {
        await markJobEnqueueFailed(operationJob.id, err);
        throw err;
      }
      await app.prisma.auditLog.create({
        data: {
          action: 'document.export_highlight_docx',
          userId: user.sub,
          tenantId: user.tenantId,
          documentId,
          meta: { versionId, operationJobId: operationJob.id },
        },
      });
      return reply.status(202).send({
        operationJobId: operationJob.id,
        status: 'processing',
      });
    },
  );
  r.post(
    '/documents/:documentId/versions/:versionId/operations/export-form-data',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ documentId: z.string(), versionId: z.string() }),
        body: z.object({ format: z.enum(['json', 'csv']).default('json') }),
        response: {
          202: z.object({ operationJobId: z.string(), status: z.literal('processing') }),
          400: errorBody,
          404: errorBody,
          503: errorBody,
        },
      },
    },
    async (request, reply) => {
      if (!isS3Configured()) {
        return reply.code(503).send({ error: 'S3 is not configured' });
      }
      const user = getAuthUser(request);
      const { documentId, versionId } = request.params;
      const document = await findDocumentForUser(app.prisma, documentId, user, { capability: 'edit' });
      if (!document) {
        return reply.code(404).send({ error: 'Document not found' });
      }
      const sourceVersion = document.versions.find((v: { id: string }) => v.id === versionId);
      if (!sourceVersion || sourceVersion.status !== 'ready') {
        return reply.code(400).send({ error: 'Source version is not ready' });
      }
      const operationJob = await app.prisma.job.create({
        data: {
          type: 'export-form-data',
          status: 'queued',
          tenantId: user.tenantId,
          payload: { documentId, versionId, format: request.body.format },
        },
      });
      try {
        await enqueueExportFormDataJob(env, {
          jobId: `export-form-data-${operationJob.id}`,
          operationJobId: operationJob.id,
          documentId,
          versionId,
          tenantId: user.tenantId,
          sourceS3Key: sourceVersion.s3Key,
          format: request.body.format,
          requestId: request.requestId,
        });
      } catch (err) {
        await markJobEnqueueFailed(operationJob.id, err);
        throw err;
      }
      return reply.status(202).send({ operationJobId: operationJob.id, status: 'processing' });
    },
  );
  r.post(
    '/documents/:documentId/versions/:versionId/operations/apply-visual-signature',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ documentId: z.string(), versionId: z.string() }),
        body: z.object({
          imageS3Key: z.string().min(1),
          page: z.number().int().min(1).default(1),
          xNorm: z.number().min(0).max(1).default(0.1),
          yNorm: z.number().min(0).max(1).default(0.8),
          widthNorm: z.number().min(0.01).max(1).default(0.25),
          heightNorm: z.number().min(0.01).max(1).default(0.1),
        }),
        response: {
          202: z.object({
            operationJobId: z.string(),
            versionId: z.string(),
            status: z.literal('processing'),
          }),
          400: errorBody,
          404: errorBody,
          503: errorBody,
        },
      },
    },
    async (request, reply) => {
      if (!isS3Configured()) {
        return reply.code(503).send({ error: 'S3 is not configured' });
      }
      const user = getAuthUser(request);
      const { documentId, versionId } = request.params;
      const document = await findDocumentForUser(app.prisma, documentId, user, { capability: 'edit' });
      if (!document) {
        return reply.code(404).send({ error: 'Document not found' });
      }
      const sourceVersion = document.versions.find((v: { id: string }) => v.id === versionId);
      if (!sourceVersion || sourceVersion.status !== 'ready') {
        return reply.code(400).send({ error: 'Source version is not ready' });
      }
      const { targetVersion, operationJob, targetS3Key } = await app.prisma.$transaction(
        async (tx) => {
          const nextVersionNumber = await reserveNextVersionNumber(tx, document.id);
          const reservedTargetS3Key = buildOriginalKey(
            document.id,
            nextVersionNumber,
            `signed-v${sourceVersion.version}.pdf`,
          );
          const version = await tx.documentVersion.create({
            data: {
              documentId: document.id,
              version: nextVersionNumber,
              s3Key: reservedTargetS3Key,
              size: BigInt(0),
              mimeType: sourceVersion.mimeType,
              status: 'processing',
              sourceVersionId: sourceVersion.id,
            },
          });
          const job = await tx.job.create({
            data: {
              type: 'apply-visual-signature',
              status: 'queued',
              tenantId: user.tenantId,
              payload: { documentId, sourceVersionId: sourceVersion.id },
            },
          });
          return { targetVersion: version, operationJob: job, targetS3Key: reservedTargetS3Key };
        },
      );
      const { imageS3Key, page, xNorm, yNorm, widthNorm, heightNorm } = request.body;
      try {
        await enqueueApplyVisualSignatureJob(env, {
          jobId: `apply-visual-signature-${targetVersion.id}`,
          operationJobId: operationJob.id,
          documentId,
          sourceVersionId: sourceVersion.id,
          targetVersionId: targetVersion.id,
          tenantId: user.tenantId,
          sourceS3Key: sourceVersion.s3Key,
          targetS3Key,
          imageS3Key,
          page,
          xNorm,
          yNorm,
          widthNorm,
          heightNorm,
          requestId: request.requestId,
        });
      } catch (err) {
        await markVersionOperationEnqueueFailed({
          operationJobId: operationJob.id,
          targetVersionId: targetVersion.id,
          err,
        });
        throw err;
      }
      void publishVersionCreatedDocumentEvent(env, document.id, targetVersion.id, targetVersion.version).catch((err) => {
        request.log.warn({ err }, 'version_created event publish failed');
      });
      return reply.status(202).send({
        operationJobId: operationJob.id,
        versionId: targetVersion.id,
        status: 'processing',
      });
    },
  );
};
