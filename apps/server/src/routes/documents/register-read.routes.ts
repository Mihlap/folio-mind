import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { appliedDocxKey, highlightEditsDocxKey, previewPageKey } from '@folio-mind/pdf-contracts';
import { findDocumentForUser, getAuthUser } from '../../lib/documents/document-access.js';
import { clampPreviewRange } from '../../lib/documents/preview-config.js';
import type { Env } from '../../lib/config/env.js';
import { enqueuePreviewPagesJob } from '../../lib/queue/queue.js';
import {
  getObjectByteRange,
  getObjectWithBuffer,
  getPresignedGetUrl,
  isS3Configured,
  isS3NetworkError,
  checkAppliedDocxVersionIds,
  listPreviewPagesInRange,
  s3ObjectExists,
} from '../../lib/storage/s3.js';
import { decodeCursor, encodeCursor, mapDocumentListItem } from './helpers.js';
import { toDocumentReviewStatus } from '../../lib/documents/document-review-status.js';
import {
  documentSchema,
  documentReviewStatusSchema,
  errorBody,
  versionIntegrityResponseSchema,
  versionListItemSchema,
} from './schemas.js';
export const registerReadRoutes: FastifyPluginAsync<{
  env: Env;
}> = async (app, opts) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const env = opts.env;
  r.get(
    '/documents',
    {
      preHandler: [app.authenticate],
      schema: {
        querystring: z.object({
          limit: z.coerce.number().int().min(1).max(50).default(20),
          cursor: z.string().optional(),
          projectId: z.string().optional(),
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
      const { limit, cursor, projectId } = request.query;
      const decoded = cursor ? decodeCursor(cursor) : null;
      const documents = await app.prisma.document.findMany({
        where: {
          tenantId: user.tenantId,
          ownerId: user.sub,
          ...(projectId ? { projectId } : {}),
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
          project: { select: { name: true } },
          versions: { orderBy: { version: 'desc' }, take: 1 },
        },
      });
      const hasMore = documents.length > limit;
      const page = hasMore ? documents.slice(0, limit) : documents;
      const last = page[page.length - 1];
      return {
        items: page.map((doc) => mapDocumentListItem(doc, toDocumentReviewStatus)),
        nextCursor: hasMore && last ? encodeCursor(last.updatedAt, last.id) : null,
      };
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
            reviewStatus: documentReviewStatusSchema,
            reviewStatusChangedAt: z.string().nullable(),
            projectId: z.string().nullable(),
            projectName: z.string().nullable(),
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
      const appliedDocxVersionIds = isS3Configured()
        ? await Promise.race([
            checkAppliedDocxVersionIds(
              document.id,
              document.versions
                .filter(
                  (v: { version: number; status: string }) =>
                    v.version > 1 && v.status !== 'pending_upload',
                )
                .map((v: { id: string }) => v.id),
            ),
            new Promise<Set<string>>((resolve) => {
              setTimeout(() => resolve(new Set()), 4_000);
            }),
          ])
        : new Set<string>();
      return {
        id: document.id,
        title: document.title,
        reviewStatus: toDocumentReviewStatus(document.reviewStatus),
        reviewStatusChangedAt: document.reviewStatusChangedAt?.toISOString() ?? null,
        projectId: document.projectId ?? null,
        projectName: document.project?.name ?? null,
        versions: document.versions.map(
          (v: {
            id: string;
            version: number;
            status: string;
            size: bigint;
            mimeType: string;
            pageCount: number | null;
            createdAt: Date;
            integrityStatus: string | null;
            integritySummary: string | null;
            confidenceLevel: string | null;
            confidenceScore: number | null;
            confidenceSummary: string | null;
            confidenceDetails: unknown;
            sourceVersionId: string | null;
            sourceDocxKey: string | null;
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
            confidenceLevel: v.confidenceLevel ?? null,
            confidenceScore: v.confidenceScore ?? null,
            confidenceSummary: v.confidenceSummary ?? null,
            confidenceDetails: (v as { confidenceDetails?: unknown }).confidenceDetails ?? null,
            sourceVersionId: (v as { sourceVersionId?: string | null }).sourceVersionId ?? null,
            sourceDocxKey: v.sourceDocxKey ?? null,
            hasAppliedDocx: appliedDocxVersionIds.has(v.id),
          }),
        ),
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
        v.status === 'processing' && !v.integrityStatus ? 'pending' : v.integrityStatus;
      return {
        versionId: v.id,
        status: integrityStatus as
          | 'pending'
          | 'intact'
          | 'modified'
          | 'cannot_verify'
          | 'failed'
          | null,
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
      try {
        const rangeHeader = request.headers.range;
        if (typeof rangeHeader === 'string' && /^bytes=/i.test(rangeHeader)) {
          const part = await getObjectByteRange(version.s3Key, rangeHeader);
          void app.prisma.auditLog.create({
            data: {
              action: 'document.view_file',
              userId: user.sub,
              tenantId: user.tenantId,
              documentId: document.id,
              meta: { versionId: version.id, range: rangeHeader },
            },
          });
          reply.header('Content-Type', part.contentType);
          reply.header('Content-Length', part.contentLength);
          reply.header('Accept-Ranges', 'bytes');
          if (part.contentRange) {
            reply.header('Content-Range', part.contentRange);
          }
          return reply.code(206).header('Cache-Control', 'private, max-age=300').send(part.body);
        }

        const { buffer, contentType } = await getObjectWithBuffer(version.s3Key);
        void app.prisma.auditLog.create({
          data: {
            action: 'document.view_file',
            userId: user.sub,
            tenantId: user.tenantId,
            documentId: document.id,
            meta: { versionId: version.id },
          },
        });
        return reply
          .header('Content-Type', contentType)
          .header('Content-Length', buffer.length)
          .header('Accept-Ranges', 'bytes')
          .header('Cache-Control', 'private, max-age=300')
          .send(buffer);
      } catch (err) {
        const notFound =
          typeof err === 'object' &&
          err !== null &&
          'name' in err &&
          (
            err as {
              name: string;
            }
          ).name === 'NoSuchKey';
        if (notFound) {
          return reply.code(404).send({
            error:
              version.status === 'processing'
                ? 'File is not ready yet'
                : 'PDF отсутствует в хранилище — удалите документ и загрузите заново',
          });
        }
        if (isS3NetworkError(err)) {
          return reply.code(503).send({ error: 'Временная ошибка хранилища S3, повторите позже' });
        }
        throw err;
      }
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
      const { from, to } = clampPreviewRange(env, scanLimit, request.query.from, request.query.to);
      const expiresInSeconds = 3600;
      const pages: Array<{
        page: number;
        url: string;
      }> = [];
      const missing: number[] = [];
      const existingPreviewPages = await listPreviewPagesInRange(documentId, versionId, from, to);
      for (let page = from; page <= to; page++) {
        if (existingPreviewPages.has(page)) {
          const key = previewPageKey(documentId, versionId, page);
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
    '/documents/:documentId/versions/:versionId/source-docx-url',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({
          documentId: z.string(),
          versionId: z.string(),
        }),
        response: {
          200: z.object({ url: z.string(), expiresInSeconds: z.number() }),
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
      const appliedKey = appliedDocxKey(document.id, version.id);
      const hasAppliedDocx = await s3ObjectExists(appliedKey);
      const docxKey = hasAppliedDocx
        ? appliedKey
        : (
            version as {
              sourceDocxKey?: string | null;
            }
          ).sourceDocxKey;
      if (!docxKey) {
        return reply.code(400).send({ error: 'No DOCX for this version' });
      }
      const expiresInSeconds = 3600;
      const url = await getPresignedGetUrl({ key: docxKey, expiresInSeconds });
      await app.prisma.auditLog.create({
        data: {
          action: 'document.download_docx',
          userId: user.sub,
          tenantId: user.tenantId,
          documentId: document.id,
          meta: { versionId: version.id, docxKey },
        },
      });
      return { url, expiresInSeconds };
    },
  );
  r.get(
    '/documents/:documentId/versions/:versionId/highlight-docx-url',
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
      const docxKey = highlightEditsDocxKey(document.id, version.id);
      if (!(await s3ObjectExists(docxKey))) {
        return reply.code(404).send({ error: 'DOCX с подсветкой ещё не готов' });
      }
      const expiresInSeconds = 3600;
      const url = await getPresignedGetUrl({ key: docxKey, expiresInSeconds });
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
          status: integrityStatus as
            | 'pending'
            | 'intact'
            | 'modified'
            | 'cannot_verify'
            | 'failed'
            | null,
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
        versionA.score != null && versionB.score != null ? versionB.score - versionA.score : null;
      return { versionA, versionB, changed, statusDelta, scoreDelta };
    },
  );
};
