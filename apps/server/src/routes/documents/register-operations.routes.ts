import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { findDocumentForUser, getAuthUser } from '../../lib/documents/document-access.js';
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
  enqueueExportHighlightDocxJob,
  enqueueMergeVersionsJob,
  enqueueOptimizePdfJob,
  enqueueSplitPagesJob,
} from '../../lib/queue/queue.js';
import { isUserUploadedSourceDocxKey } from '@folio-mind/pdf-contracts';
import { isS3Configured } from '../../lib/storage/s3.js';
import { buildOriginalKey } from './helpers.js';
import {
  errorBody,
  applyLayoutPdfSchema,
  mergeVersionsSchema,
  optimizePdfSchema,
  splitPagesSchema,
  versionCompareResponseSchema,
} from './schemas.js';
export const registerOperationsRoutes: FastifyPluginAsync<{
  env: Env;
}> = async (app, opts) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const env = opts.env;
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
      const document = await findDocumentForUser(app.prisma, documentId, user);
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
      const nextVersionNumber = (document.versions[0]?.version ?? 0) + 1;
      const targetS3Key = buildOriginalKey(
        document.id,
        nextVersionNumber,
        `split-v${sourceVersion.version}.pdf`,
      );
      const [targetVersion, operationJob] = await app.prisma.$transaction([
        app.prisma.documentVersion.create({
          data: {
            documentId: document.id,
            version: nextVersionNumber,
            s3Key: targetS3Key,
            size: BigInt(0),
            mimeType: sourceVersion.mimeType,
            status: 'processing',
          },
        }),
        app.prisma.job.create({
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
        }),
      ]);
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
      return reply.status(202).send({
        operationJobId: operationJob.id,
        versionId: targetVersion.id,
        version: targetVersion.version,
        status: 'processing',
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
      const document = await findDocumentForUser(app.prisma, documentId, user);
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
      const nextVersionNumber = (document.versions[0]?.version ?? 0) + 1;
      const targetS3Key = buildOriginalKey(
        document.id,
        nextVersionNumber,
        `merge-v${readyVersions.map((v) => v.version).join('-')}.pdf`,
      );
      const [targetVersion, operationJob] = await app.prisma.$transaction([
        app.prisma.documentVersion.create({
          data: {
            documentId: document.id,
            version: nextVersionNumber,
            s3Key: targetS3Key,
            size: BigInt(0),
            mimeType: readyVersions[0]!.mimeType,
            status: 'processing',
          },
        }),
        app.prisma.job.create({
          data: {
            type: 'pdf-merge',
            status: 'queued',
            tenantId: user.tenantId,
            payload: {
              documentId,
              sourceVersionIds: versionIds,
            },
          },
        }),
      ]);
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
      const document = await findDocumentForUser(app.prisma, documentId, user);
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
      const editedPages = new Set(
        [...baseEditRows, ...compareEditRows].map((row) => row.page),
      );
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
      const document = await findDocumentForUser(app.prisma, documentId, user);
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
      const nextVersionNumber = (document.versions[0]?.version ?? 0) + 1;
      const targetS3Key = buildOriginalKey(
        document.id,
        nextVersionNumber,
        `final-v${sourceVersion.version}.pdf`,
      );
      const [targetVersion, operationJob] = await app.prisma.$transaction([
        app.prisma.documentVersion.create({
          data: {
            documentId: document.id,
            version: nextVersionNumber,
            s3Key: targetS3Key,
            size: BigInt(0),
            mimeType: sourceVersion.mimeType,
            status: 'processing',
            sourceVersionId: sourceVersion.id,
          },
        }),
        app.prisma.job.create({
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
        }),
      ]);
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
      const document = await findDocumentForUser(app.prisma, documentId, user);
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
      const nextVersionNumber = (document.versions[0]?.version ?? 0) + 1;
      const targetS3Key = buildOriginalKey(
        document.id,
        nextVersionNumber,
        `optimized-${preset}-v${sourceVersion.version}.pdf`,
      );
      const [targetVersion, operationJob] = await app.prisma.$transaction([
        app.prisma.documentVersion.create({
          data: {
            documentId: document.id,
            version: nextVersionNumber,
            s3Key: targetS3Key,
            size: BigInt(0),
            mimeType: sourceVersion.mimeType,
            status: 'processing',
            sourceVersionId: sourceVersion.id,
          },
        }),
        app.prisma.job.create({
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
        }),
      ]);
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
      const { objects } = request.body;
      const document = await findDocumentForUser(app.prisma, documentId, user);
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
      if (maxPage > sourceVersion.pageCount) {
        return reply.code(400).send({ error: `Страница ${maxPage} больше числа страниц PDF` });
      }
      const nextVersionNumber = (document.versions[0]?.version ?? 0) + 1;
      const targetS3Key = buildOriginalKey(
        document.id,
        nextVersionNumber,
        `layout-v${sourceVersion.version}.pdf`,
      );
      const [targetVersion, operationJob] = await app.prisma.$transaction([
        app.prisma.documentVersion.create({
          data: {
            documentId: document.id,
            version: nextVersionNumber,
            s3Key: targetS3Key,
            size: BigInt(0),
            mimeType: sourceVersion.mimeType,
            status: 'processing',
            sourceVersionId: sourceVersion.id,
          },
        }),
        app.prisma.job.create({
          data: {
            type: 'apply-layout-pdf',
            status: 'queued',
            tenantId: user.tenantId,
            payload: {
              documentId,
              sourceVersionId: sourceVersion.id,
              objectCount: objects.length,
            },
          },
        }),
      ]);
      await enqueueApplyLayoutPdfJob(env, {
        jobId: `apply-layout-pdf-${targetVersion.id}`,
        operationJobId: operationJob.id,
        documentId,
        sourceVersionId: sourceVersion.id,
        targetVersionId: targetVersion.id,
        tenantId: user.tenantId,
        sourceS3Key: sourceVersion.s3Key,
        targetS3Key,
        layoutObjects: objects,
        requestId: request.requestId,
      });
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
            operationJobId: operationJob.id,
          },
        },
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
      const document = await findDocumentForUser(app.prisma, documentId, user);
      if (!document) {
        return reply.code(404).send({ error: 'Document not found' });
      }
      const sourceVersion = document.versions.find((v: { id: string }) => v.id === versionId);
      if (!sourceVersion || sourceVersion.status !== 'ready') {
        return reply.code(400).send({ error: 'Source version is not ready' });
      }
      const versionRows = document.versions.map(
        (v: { id: string; sourceVersionId: string | null; s3Key: string; sourceDocxKey: string | null }) => ({
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
};
