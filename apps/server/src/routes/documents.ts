import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { findDocumentForUser, getAuthUser } from '../lib/documents/document-access.js';
import { deleteCachedSummaries } from '../lib/ai/ai-cache.js';
import type { Env } from '../lib/config/env.js';
import { clampPreviewRange } from '../lib/documents/preview-config.js';
import { UPLOAD_RATE_LIMIT } from '../lib/auth/rate-limits.js';
import {
  enqueuePreviewJob,
  enqueuePreviewPagesJob,
  enqueueMergeVersionsJob,
  enqueueSplitPagesJob,
} from '../lib/queue/queue.js';
import { previewPageKey } from '@folio-mind/pdf-contracts';
import { compareAcceptedEdits } from '../lib/documents/compare-accepted-edits.js';
import {
  buildVersionCompareResult,
  loadVersionPageTexts,
} from '../lib/documents/version-compare.js';
import {
  deleteDocumentArtifacts,
  deleteVersionArtifacts,
  getObjectReadable,
  getPresignedGetUrl,
  getPresignedPutUrl,
  isS3Configured,
  putObjectByKey,
  resolveS3Key,
  s3ObjectExists,
} from '../lib/storage/s3.js';

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const uploadRateLimit = { rateLimit: UPLOAD_RATE_LIMIT };
const errorBody = z.object({ error: z.string() });

const documentSchema = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  latestVersion: z
    .object({
      id: z.string(),
      version: z.number(),
      status: z.string(),
      size: z.string(),
      mimeType: z.string(),
    })
    .nullable(),
});

const splitPagesSchema = z.object({
  pages: z
    .array(z.number().int().min(1))
    .min(1)
    .max(500)
    .refine((pages) => new Set(pages).size === pages.length, 'Номера страниц должны быть уникальны'),
});

const mergeVersionsSchema = z.object({
  versionIds: z
    .array(z.string().min(1))
    .min(2)
    .max(20)
    .refine((ids) => new Set(ids).size === ids.length, 'versionIds must be unique'),
});

const textDiffLineSchema = z.object({
  type: z.enum(['equal', 'insert', 'delete']),
  text: z.string(),
});

const pageTextDiffSchema = z.object({
  page: z.number(),
  status: z.enum(['unchanged', 'modified', 'added', 'removed']),
  baseText: z.string().optional(),
  compareText: z.string().optional(),
  lines: z.array(textDiffLineSchema).optional(),
});

const acceptedEditDiffItemSchema = z.object({
  page: z.number(),
  quote: z.string(),
  content: z.string(),
});

const versionCompareResponseSchema = z.object({
  baseVersionId: z.string(),
  compareVersionId: z.string(),
  baseVersion: z.number(),
  compareVersion: z.number(),
  summary: z.object({
    unchangedPages: z.number(),
    modifiedPages: z.number(),
    addedPages: z.number(),
    removedPages: z.number(),
  }),
  pages: z.array(pageTextDiffSchema),
  acceptedEdits: z.object({
    baseCount: z.number(),
    compareCount: z.number(),
    onlyInCompare: z.array(acceptedEditDiffItemSchema),
    onlyInBase: z.array(acceptedEditDiffItemSchema),
    modified: z.array(
      z.object({
        page: z.number(),
        baseQuote: z.string(),
        compareQuote: z.string(),
        baseContent: z.string(),
        compareContent: z.string(),
      }),
    ),
  }),
  pageCount: z.object({
    base: z.number().nullable(),
    compare: z.number().nullable(),
  }),
});

const versionIntegritySignalSchema = z.object({
  id: z.string(),
  weight: z.enum(['high', 'medium', 'low']),
  message: z.string(),
});

const versionIntegrityResponseSchema = z.object({
  versionId: z.string(),
  status: z.enum(['pending', 'intact', 'modified', 'cannot_verify', 'failed']).nullable(),
  score: z.number().nullable(),
  summary: z.string().nullable(),
  analyzedAt: z.string().nullable(),
  details: z
    .object({
      revisionCount: z.number(),
      hasPrevTrailer: z.boolean(),
      creator: z.string().nullable(),
      producer: z.string().nullable(),
      creationDate: z.string().nullable(),
      modDate: z.string().nullable(),
      hasDigitalSignature: z.boolean(),
      signals: z.array(versionIntegritySignalSchema),
      analyzedWith: z.enum(['qpdf', 'builtin']),
    })
    .nullable(),
});

const versionListItemSchema = z.object({
  id: z.string(),
  version: z.number(),
  status: z.string(),
  size: z.string(),
  mimeType: z.string(),
  pageCount: z.number().nullable(),
  createdAt: z.string(),
  integrityStatus: z.string().nullable(),
  integritySummary: z.string().nullable(),
});

function buildOriginalKey(documentId: string, version: number, fileName: string) {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return resolveS3Key('originals', `${documentId}/v${version}-${safeName}`);
}

async function finalizeDocumentUpload(params: {
  prisma: PrismaClient;
  env: Env;
  user: ReturnType<typeof getAuthUser>;
  documentId: string;
  versionId: string;
  version: { s3Key: string; sha256: string | null };
  sha256?: string;
  requestId?: string;
}): Promise<{ versionId: string; status: string; jobId: string }> {
  const { prisma, env, user, documentId, versionId, version, sha256, requestId } = params;

  const job = await prisma.job.create({
    data: {
      type: 'preview',
      status: 'queued',
      tenantId: user.tenantId,
      payload: { documentId, versionId, s3Key: version.s3Key },
    },
  });

  await prisma.documentVersion.update({
    where: { id: versionId },
    data: {
      status: 'processing',
      sha256: sha256 ?? version.sha256,
    },
  });

  await enqueuePreviewJob(env, {
    jobId: job.id,
    documentId,
    versionId,
    tenantId: user.tenantId,
    s3Key: version.s3Key,
    requestId,
  });

  await prisma.auditLog.create({
    data: {
      action: 'document.upload_complete',
      userId: user.sub,
      tenantId: user.tenantId,
      documentId,
      meta: { versionId, jobId: job.id },
    },
  });

  return { versionId, status: 'processing', jobId: job.id };
}

function encodeCursor(updatedAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ updatedAt: updatedAt.toISOString(), id }), 'utf8').toString(
    'base64url',
  );
}

function decodeCursor(cursor: string): { updatedAt: Date; id: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
      updatedAt: string;
      id: string;
    };
    return { updatedAt: new Date(parsed.updatedAt), id: parsed.id };
  } catch {
    return null;
  }
}

export const documentRoutes: FastifyPluginAsync<{ env: Env }> = async (app, opts) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const env = opts.env;

  r.post(
    '/documents',
    {
      preHandler: [app.authenticate],
      config: uploadRateLimit,
      schema: {
        body: z.object({
          title: z.string().min(1).max(200),
          fileName: z.string().min(1).max(255),
          mimeType: z.string().default('application/pdf'),
          size: z.number().int().positive().max(MAX_UPLOAD_BYTES),
        }),
        response: {
          201: z.object({
            document: documentSchema,
            versionId: z.string(),
            uploadUrl: z.string(),
            s3Key: z.string(),
          }),
          400: errorBody,
          503: errorBody,
        },
      },
    },
    async (request, reply) => {
      if (!isS3Configured()) {
        return reply.code(503).send({ error: 'S3 is not configured' });
      }

      const user = getAuthUser(request);
      const { title, fileName, mimeType, size } = request.body;

      if (mimeType !== 'application/pdf' && !fileName.toLowerCase().endsWith('.pdf')) {
        return reply.code(400).send({ error: 'Only PDF files are supported' });
      }

      const document = await app.prisma.document.create({
        data: {
          title,
          tenantId: user.tenantId,
          ownerId: user.sub,
          versions: {
            create: {
              version: 1,
              s3Key: 'pending',
              size: BigInt(size),
              mimeType,
              status: 'pending_upload',
            },
          },
        },
        include: { versions: true },
      });

      const version = document.versions[0]!;
      const s3Key = buildOriginalKey(document.id, version.version, fileName);

      await app.prisma.documentVersion.update({
        where: { id: version.id },
        data: { s3Key },
      });

      const uploadUrl = await getPresignedPutUrl({
        key: s3Key,
        contentType: mimeType,
      });

      await app.prisma.auditLog.create({
        data: {
          action: 'document.create',
          userId: user.sub,
          tenantId: user.tenantId,
          documentId: document.id,
          meta: { fileName, size },
        },
      });

      return reply.status(201).send({
        document: {
          id: document.id,
          title: document.title,
          createdAt: document.createdAt.toISOString(),
          updatedAt: document.updatedAt.toISOString(),
          latestVersion: {
            id: version.id,
            version: version.version,
            status: 'pending_upload',
            size: String(size),
            mimeType,
          },
        },
        versionId: version.id,
        uploadUrl,
        s3Key,
      });
    },
  );

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

      const diff = buildVersionCompareResult(basePages, comparePages);

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
    '/documents/:documentId/versions',
    {
      preHandler: [app.authenticate],
      config: uploadRateLimit,
      schema: {
        params: z.object({ documentId: z.string() }),
        body: z.object({
          fileName: z.string().min(1).max(255),
          mimeType: z.string().default('application/pdf'),
          size: z.number().int().positive().max(MAX_UPLOAD_BYTES),
        }),
        response: {
          201: z.object({
            versionId: z.string(),
            version: z.number(),
            s3Key: z.string(),
            uploadUrl: z.string(),
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
      const { fileName, mimeType, size } = request.body;

      if (mimeType !== 'application/pdf' && !fileName.toLowerCase().endsWith('.pdf')) {
        return reply.code(400).send({ error: 'Only PDF files are supported' });
      }

      const document = await findDocumentForUser(app.prisma, documentId, user);
      if (!document) {
        return reply.code(404).send({ error: 'Document not found' });
      }

      const latestVersionNumber = document.versions[0]?.version ?? 0;
      const nextVersionNumber = latestVersionNumber + 1;

      const version = await app.prisma.documentVersion.create({
        data: {
          documentId: document.id,
          version: nextVersionNumber,
          s3Key: 'pending',
          size: BigInt(size),
          mimeType,
          status: 'pending_upload',
        },
      });

      const s3Key = buildOriginalKey(document.id, version.version, fileName);
      await app.prisma.documentVersion.update({
        where: { id: version.id },
        data: { s3Key },
      });

      const uploadUrl = await getPresignedPutUrl({
        key: s3Key,
        contentType: mimeType,
      });

      await app.prisma.document.update({
        where: { id: document.id },
        data: { updatedAt: new Date() },
      });

      await app.prisma.auditLog.create({
        data: {
          action: 'document.version_create',
          userId: user.sub,
          tenantId: user.tenantId,
          documentId: document.id,
          meta: { versionId: version.id, version: nextVersionNumber, fileName, size },
        },
      });

      return reply.status(201).send({
        versionId: version.id,
        version: nextVersionNumber,
        s3Key,
        uploadUrl,
      });
    },
  );

  r.post(
    '/documents/:documentId/versions/:versionId/complete',
    {
      preHandler: [app.authenticate],
      config: uploadRateLimit,
      schema: {
        params: z.object({
          documentId: z.string(),
          versionId: z.string(),
        }),
        body: z.object({
          sha256: z.string().optional(),
        }),
        response: {
          200: z.object({
            versionId: z.string(),
            status: z.string(),
            jobId: z.string(),
          }),
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

      return finalizeDocumentUpload({
        prisma: app.prisma,
        env,
        user,
        documentId,
        versionId,
        version,
        sha256: request.body.sha256,
        requestId: request.requestId,
      });
    },
  );

  r.post(
    '/documents/:documentId/versions/:versionId/upload',
    {
      preHandler: [app.authenticate],
      config: uploadRateLimit,
      schema: {
        params: z.object({
          documentId: z.string(),
          versionId: z.string(),
        }),
        response: {
          200: z.object({
            versionId: z.string(),
            status: z.string(),
            jobId: z.string(),
          }),
          400: errorBody,
          404: errorBody,
          413: errorBody,
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

      const version = document.versions.find((v: { id: string }) => v.id === versionId);
      if (!version) {
        return reply.code(404).send({ error: 'Version not found' });
      }
      if (version.status !== 'pending_upload') {
        return reply.code(400).send({ error: 'Version already uploaded' });
      }

      const file = await request.file();
      if (!file) {
        return reply.code(400).send({ error: 'PDF file is required' });
      }

      const mime = file.mimetype || 'application/pdf';
      if (mime !== 'application/pdf' && !file.filename?.toLowerCase().endsWith('.pdf')) {
        return reply.code(400).send({ error: 'Only PDF files are supported' });
      }

      const buffer = await file.toBuffer();
      if (buffer.length > MAX_UPLOAD_BYTES) {
        return reply.code(413).send({ error: 'File too large' });
      }

      await putObjectByKey({
        key: version.s3Key,
        body: buffer,
        contentType: mime,
      });

      return finalizeDocumentUpload({
        prisma: app.prisma,
        env,
        user,
        documentId,
        versionId,
        version,
        sha256: hashBuffer(buffer),
        requestId: request.requestId,
      });
    },
  );

  r.get(
    '/documents',
    {
      preHandler: [app.authenticate],
      schema: {
        querystring: z.object({
          limit: z.coerce.number().int().min(1).max(50).default(20),
          cursor: z.string().optional(),
        }),
        response: {
          200: z.object({
            items: z.array(documentSchema),
            nextCursor: z.string().nullable(),
          }),
        },
      },
    },
    async (request) => {
      const user = getAuthUser(request);
      const { limit, cursor } = request.query;
      const decoded = cursor ? decodeCursor(cursor) : null;

      const documents = await app.prisma.document.findMany({
        where: {
          tenantId: user.tenantId,
          ownerId: user.sub,
          ...(decoded
            ? {
                OR: [
                  { updatedAt: { lt: decoded.updatedAt } },
                  { updatedAt: decoded.updatedAt, id: { lt: decoded.id } },
                ],
              }
            : {}),
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        include: {
          versions: { orderBy: { version: 'desc' }, take: 1 },
        },
      });

      const hasMore = documents.length > limit;
      const page = hasMore ? documents.slice(0, limit) : documents;
      const last = page[page.length - 1];

      return {
        items: page.map((doc) => {
          const latest = doc.versions[0];
          return {
            id: doc.id,
            title: doc.title,
            createdAt: doc.createdAt.toISOString(),
            updatedAt: doc.updatedAt.toISOString(),
            latestVersion: latest
              ? {
                  id: latest.id,
                  version: latest.version,
                  status: latest.status,
                  size: latest.size.toString(),
                  mimeType: latest.mimeType,
                }
              : null,
          };
        }),
        nextCursor: hasMore && last ? encodeCursor(last.updatedAt, last.id) : null,
      };
    },
  );

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

      await deleteCachedSummaries(env, [versionId]);
      await app.prisma.documentVersion.delete({ where: { id: versionId } });

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

      if (isS3Configured()) {
        try {
          await deleteDocumentArtifacts(document.id);
        } catch {
          // часть объектов могла отсутствовать
        }
      }

      await deleteCachedSummaries(
        env,
        document.versions.map((v: { id: string }) => v.id),
      );

      await app.prisma.document.delete({ where: { id: document.id } });

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

  r.get(
    '/documents/:documentId',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ documentId: z.string() }),
        response: {
          200: z.object({
            id: z.string(),
            title: z.string(),
            versions: z.array(versionListItemSchema),
          }),
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

      await app.prisma.auditLog.create({
        data: {
          action: 'document.view',
          userId: user.sub,
          tenantId: user.tenantId,
          documentId: document.id,
        },
      });

      return {
        id: document.id,
        title: document.title,
        versions: document.versions.map((v: {
          id: string;
          version: number;
          status: string;
          size: bigint;
          mimeType: string;
          pageCount: number | null;
          createdAt: Date;
          integrityStatus: string | null;
          integritySummary: string | null;
        }) => ({
          id: v.id,
          version: v.version,
          status: v.status,
          size: v.size.toString(),
          mimeType: v.mimeType,
          pageCount: v.pageCount ?? null,
          createdAt: v.createdAt.toISOString(),
          integrityStatus: v.integrityStatus,
          integritySummary: v.integritySummary,
        })),
      };
    },
  );

  r.get(
    '/documents/:documentId/versions/:versionId/integrity',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({
          documentId: z.string(),
          versionId: z.string(),
        }),
        response: {
          200: versionIntegrityResponseSchema,
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

      const v = version as {
        id: string;
        status: string;
        integrityStatus: string | null;
        integrityScore: number | null;
        integritySummary: string | null;
        integrityDetails: unknown;
        integrityAnalyzedAt: Date | null;
      };

      const integrityStatus =
        v.status === 'processing' && !v.integrityStatus
          ? 'pending'
          : v.integrityStatus;

      return {
        versionId: v.id,
        status: integrityStatus as 'pending' | 'intact' | 'modified' | 'cannot_verify' | 'failed' | null,
        score: v.integrityScore,
        summary: v.integritySummary,
        analyzedAt: v.integrityAnalyzedAt?.toISOString() ?? null,
        details: v.integrityDetails as z.infer<typeof versionIntegrityResponseSchema>['details'],
      };
    },
  );

  r.get(
    '/documents/:documentId/versions/:versionId/file',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({
          documentId: z.string(),
          versionId: z.string(),
        }),
      },
    },
    async (request, reply) => {
      if (!isS3Configured()) {
        return reply.code(503).send({ error: 'S3 is not configured' });
      }

      const user = getAuthUser(request);
      const document = await findDocumentForUser(app.prisma, request.params.documentId, user);
      if (!document) {
        return reply.code(404).send({ error: 'Document not found' });
      }

      const version = document.versions.find(
        (v: { id: string }) => v.id === request.params.versionId,
      );
      if (!version || version.status === 'pending_upload') {
        return reply.code(404).send({ error: 'Version not available' });
      }

      let body: Awaited<ReturnType<typeof getObjectReadable>>['body'];
      let contentType: string;
      let contentLength: number | undefined;
      try {
        const object = await getObjectReadable(version.s3Key);
        body = object.body;
        contentType = object.contentType;
        contentLength = object.contentLength;
      } catch (err) {
        const notFound =
          typeof err === 'object' &&
          err !== null &&
          'name' in err &&
          (err as { name: string }).name === 'NoSuchKey';
        if (notFound && version.status === 'processing') {
          return reply.code(404).send({ error: 'File is not ready yet' });
        }
        throw err;
      }

      await app.prisma.auditLog.create({
        data: {
          action: 'document.view_file',
          userId: user.sub,
          tenantId: user.tenantId,
          documentId: document.id,
          meta: { versionId: version.id },
        },
      });

      if (contentLength) {
        reply.header('Content-Length', contentLength);
      }

      return reply
        .header('Content-Type', contentType)
        .header('Cache-Control', 'private, max-age=300')
        .send(body);
    },
  );

  r.get(
    '/documents/:documentId/versions/:versionId/previews',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({
          documentId: z.string(),
          versionId: z.string(),
        }),
        querystring: z.object({
          from: z.coerce.number().int().min(1).optional(),
          to: z.coerce.number().int().min(1).optional(),
        }),
        response: {
          200: z.object({
            pageCount: z.number(),
            pages: z.array(
              z.object({
                page: z.number(),
                url: z.string(),
              }),
            ),
            status: z.enum(['processing', 'ready', 'partial', 'unavailable']),
            pendingPages: z.array(z.number()).optional(),
          }),
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

      const version = document.versions.find(
        (v: { id: string; status: string; pageCount?: number | null; s3Key: string }) =>
          v.id === versionId,
      );
      if (!version || version.status === 'pending_upload') {
        return reply.code(404).send({ error: 'Version not available' });
      }

      const isProcessing = version.status === 'processing';
      const pageCount = version.pageCount ?? 0;
      const scanLimit = pageCount > 0 ? pageCount : env.PREVIEW_MAX_PAGES;

      if (!isProcessing && pageCount === 0) {
        return { pageCount: 0, pages: [], status: 'unavailable' as const };
      }

      const { from, to } = clampPreviewRange(
        env,
        scanLimit,
        request.query.from,
        request.query.to,
      );
      const expiresInSeconds = 3600;
      const pages: Array<{ page: number; url: string }> = [];
      const missing: number[] = [];

      for (let page = from; page <= to; page++) {
        const key = previewPageKey(documentId, versionId, page);
        if (await s3ObjectExists(key)) {
          const url = await getPresignedGetUrl({ key, expiresInSeconds });
          pages.push({ page, url });
        } else {
          missing.push(page);
        }
      }

      if (isProcessing) {
        if (pages.length === 0) {
          return { pageCount: 0, pages: [], status: 'processing' as const };
        }
        return {
          pageCount: pageCount || to,
          pages,
          status: 'partial' as const,
          ...(missing.length > 0 ? { pendingPages: missing } : {}),
        };
      }

      if (missing.length > 0) {
        const fromPage = Math.min(...missing);
        const toPage = Math.max(...missing);
        const lazyJob = await app.prisma.job.create({
          data: {
            type: 'preview-pages',
            status: 'queued',
            tenantId: user.tenantId,
            payload: {
              documentId,
              versionId,
              s3Key: version.s3Key,
              fromPage,
              toPage,
            },
          },
        });

        await enqueuePreviewPagesJob(env, {
          jobId: lazyJob.id,
          documentId,
          versionId,
          tenantId: user.tenantId,
          s3Key: version.s3Key,
          fromPage,
          toPage,
          requestId: request.requestId,
        });

        return {
          pageCount,
          pages,
          status: 'partial' as const,
          pendingPages: missing,
        };
      }

      return { pageCount, pages, status: 'ready' as const };
    },
  );

  r.get(
    '/documents/:documentId/versions/:versionId/download-url',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({
          documentId: z.string(),
          versionId: z.string(),
        }),
        response: {
          200: z.object({ url: z.string(), expiresInSeconds: z.number() }),
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
      const document = await findDocumentForUser(app.prisma, request.params.documentId, user);
      if (!document) {
        return reply.code(404).send({ error: 'Document not found' });
      }

      const version = document.versions.find(
        (v: { id: string }) => v.id === request.params.versionId,
      );
      if (!version || version.status === 'pending_upload') {
        return reply.code(404).send({ error: 'Version not available' });
      }

      const expiresInSeconds = 3600;
      const url = await getPresignedGetUrl({ key: version.s3Key, expiresInSeconds });

      await app.prisma.auditLog.create({
        data: {
          action: 'document.download',
          userId: user.sub,
          tenantId: user.tenantId,
          documentId: document.id,
          meta: { versionId: version.id },
        },
      });

      return { url, expiresInSeconds };
    },
  );

  r.get(
    '/documents/:documentId/versions/:versionId/integrity/compare/:otherVersionId',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({
          documentId: z.string(),
          versionId: z.string(),
          otherVersionId: z.string(),
        }),
        response: {
          200: z.object({
            versionA: versionIntegrityResponseSchema,
            versionB: versionIntegrityResponseSchema,
            changed: z.boolean(),
            statusDelta: z.string().nullable(),
            scoreDelta: z.number().nullable(),
          }),
          404: errorBody,
        },
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const { documentId, versionId, otherVersionId } = request.params;

      const document = await findDocumentForUser(app.prisma, documentId, user);
      if (!document) {
        return reply.code(404).send({ error: 'Document not found' });
      }

      const fetchIntegrity = async (vid: string) => {
        const v = document.versions.find((x: { id: string }) => x.id === vid);
        if (!v) return null;
        const integrityStatus =
          v.status === 'processing' && !v.integrityStatus ? 'pending' : v.integrityStatus;
        return {
          versionId: v.id,
          status: integrityStatus as 'pending' | 'intact' | 'modified' | 'cannot_verify' | 'failed' | null,
          score: v.integrityScore,
          summary: v.integritySummary,
          analyzedAt: v.integrityAnalyzedAt?.toISOString() ?? null,
          details: v.integrityDetails as z.infer<typeof versionIntegrityResponseSchema>['details'],
        };
      };

      const versionA = await fetchIntegrity(versionId);
      const versionB = await fetchIntegrity(otherVersionId);

      if (!versionA || !versionB) {
        return reply.code(404).send({ error: 'One or both versions not found' });
      }

      const changed = versionA.status !== versionB.status || versionA.score !== versionB.score;
      const statusDelta =
        versionA.status !== versionB.status
          ? `${versionA.status ?? 'none'} \u2192 ${versionB.status ?? 'none'}`
          : null;
      const scoreDelta =
        versionA.score != null && versionB.score != null
          ? versionB.score - versionA.score
          : null;

      return { versionA, versionB, changed, statusDelta, scoreDelta };
    },
  );
};

export function hashBuffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}
