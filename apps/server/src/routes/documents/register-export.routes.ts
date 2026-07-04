import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  BOOKLET_EXPORT_DEFAULT_JPEG_DPI,
  BOOKLET_EXPORT_MAX_PAGES,
  exportBookletZipKey,
  exportPagesZipKey,
} from '@folio-mind/pdf-contracts';
import { findDocumentForUser, getAuthUser } from '../../lib/documents/document-access.js';
import type { Env } from '../../lib/config/env.js';
import {
  enqueueExportBookletJob,
  enqueueExportPagesJob,
  enqueuePrintReadinessJob,
} from '../../lib/queue/queue.js';
import { getPresignedGetUrl, isS3Configured, s3ObjectExists } from '../../lib/storage/s3.js';
import { errorBody } from './schemas.js';

const exportPagesBodySchema = z.object({
  pages: z.array(z.number().int().positive()).min(1),
  format: z.enum(['jpeg', 'png']).default('jpeg'),
  dpi: z.number().int().min(72).max(600).default(BOOKLET_EXPORT_DEFAULT_JPEG_DPI),
});

const exportBookletBodySchema = z.object({
  jpegDpi: z.number().int().min(72).max(600).default(BOOKLET_EXPORT_DEFAULT_JPEG_DPI),
  pdfA: z.boolean().default(false),
});

export const registerExportRoutes: FastifyPluginAsync<{ env: Env }> = async (app, opts) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const env = opts.env;

  async function resolveReadyVersion(documentId: string, versionId: string, user: { sub: string; tenantId: string }) {
    const document = await findDocumentForUser(app.prisma, documentId, user);
    if (!document) return null;
    const version = document.versions.find((v: { id: string; status: string }) => v.id === versionId);
    if (!version || version.status !== 'ready') return null;
    return { document, version };
  }

  r.post(
    '/documents/:documentId/versions/:versionId/operations/export-booklet',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ documentId: z.string(), versionId: z.string() }),
        body: exportBookletBodySchema,
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
      const resolved = await resolveReadyVersion(request.params.documentId, request.params.versionId, user);
      if (!resolved) {
        return reply.code(404).send({ error: 'Document or version not found' });
      }
      const { document, version } = resolved;
      const pageCount = version.pageCount ?? 0;
      if (pageCount > BOOKLET_EXPORT_MAX_PAGES) {
        return reply.code(400).send({
          error: `Слишком много страниц (${pageCount}). Лимит экспорта: ${BOOKLET_EXPORT_MAX_PAGES}.`,
        });
      }

      const operationJob = await app.prisma.job.create({
        data: {
          type: 'export-booklet',
          status: 'queued',
          tenantId: user.tenantId,
          payload: { documentId: document.id, versionId: version.id },
        },
      });

      await enqueueExportBookletJob(env, {
        jobId: `export-booklet-${operationJob.id}`,
        operationJobId: operationJob.id,
        documentId: document.id,
        versionId: version.id,
        tenantId: user.tenantId,
        sourceS3Key: version.s3Key,
        title: document.title,
        jpegDpi: request.body.jpegDpi,
        pdfA: request.body.pdfA,
        requestId: request.requestId,
      });

      await app.prisma.auditLog.create({
        data: {
          action: 'document.export_booklet',
          userId: user.sub,
          tenantId: user.tenantId,
          documentId: document.id,
          meta: { versionId: version.id, operationJobId: operationJob.id },
        },
      });

      return reply.status(202).send({ operationJobId: operationJob.id, status: 'processing' });
    },
  );

  r.post(
    '/documents/:documentId/versions/:versionId/operations/export-pages',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ documentId: z.string(), versionId: z.string() }),
        body: exportPagesBodySchema,
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
      const resolved = await resolveReadyVersion(request.params.documentId, request.params.versionId, user);
      if (!resolved) {
        return reply.code(404).send({ error: 'Document or version not found' });
      }
      const { document, version } = resolved;
      const pageCount = version.pageCount ?? 0;
      const pages = [...new Set(request.body.pages)].sort((a, b) => a - b);
      const invalid = pages.find((p) => pageCount > 0 && p > pageCount);
      if (invalid) {
        return reply.code(400).send({ error: `Страница ${invalid} больше числа страниц (${pageCount})` });
      }

      const operationJob = await app.prisma.job.create({
        data: {
          type: 'export-pages',
          status: 'queued',
          tenantId: user.tenantId,
          payload: { documentId: document.id, versionId: version.id, pages },
        },
      });

      await enqueueExportPagesJob(env, {
        jobId: `export-pages-${operationJob.id}`,
        operationJobId: operationJob.id,
        documentId: document.id,
        versionId: version.id,
        tenantId: user.tenantId,
        sourceS3Key: version.s3Key,
        pages,
        format: request.body.format,
        dpi: request.body.dpi,
        requestId: request.requestId,
      });

      await app.prisma.auditLog.create({
        data: {
          action: 'document.export_pages',
          userId: user.sub,
          tenantId: user.tenantId,
          documentId: document.id,
          meta: { versionId: version.id, pages, operationJobId: operationJob.id },
        },
      });

      return reply.status(202).send({ operationJobId: operationJob.id, status: 'processing' });
    },
  );

  r.post(
    '/documents/:documentId/versions/:versionId/operations/print-readiness',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ documentId: z.string(), versionId: z.string() }),
        response: {
          202: z.object({ operationJobId: z.string(), status: z.literal('processing') }),
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
      const resolved = await resolveReadyVersion(request.params.documentId, request.params.versionId, user);
      if (!resolved) {
        return reply.code(404).send({ error: 'Document or version not found' });
      }
      const { document, version } = resolved;

      const operationJob = await app.prisma.job.create({
        data: {
          type: 'print-readiness',
          status: 'queued',
          tenantId: user.tenantId,
          payload: { documentId: document.id, versionId: version.id },
        },
      });

      await enqueuePrintReadinessJob(env, {
        jobId: `print-readiness-${operationJob.id}`,
        operationJobId: operationJob.id,
        documentId: document.id,
        versionId: version.id,
        tenantId: user.tenantId,
        sourceS3Key: version.s3Key,
        requestId: request.requestId,
      });

      return reply.status(202).send({ operationJobId: operationJob.id, status: 'processing' });
    },
  );

  r.get(
    '/documents/:documentId/versions/:versionId/booklet-export-url',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ documentId: z.string(), versionId: z.string() }),
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
      const resolved = await resolveReadyVersion(request.params.documentId, request.params.versionId, user);
      if (!resolved) {
        return reply.code(404).send({ error: 'Document or version not found' });
      }
      const zipKey = exportBookletZipKey(resolved.document.id, resolved.version.id);
      if (!(await s3ObjectExists(zipKey))) {
        return reply.code(404).send({ error: 'Пакет буклета ещё не готов' });
      }
      const expiresInSeconds = 3600;
      const url = await getPresignedGetUrl({ key: zipKey, expiresInSeconds });
      await app.prisma.auditLog.create({
        data: {
          action: 'document.download_booklet_export',
          userId: user.sub,
          tenantId: user.tenantId,
          documentId: resolved.document.id,
          meta: { versionId: resolved.version.id, zipKey },
        },
      });
      return { url, expiresInSeconds };
    },
  );

  r.get(
    '/documents/:documentId/versions/:versionId/pages-export-url',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ documentId: z.string(), versionId: z.string() }),
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
      const resolved = await resolveReadyVersion(request.params.documentId, request.params.versionId, user);
      if (!resolved) {
        return reply.code(404).send({ error: 'Document or version not found' });
      }
      const zipKey = exportPagesZipKey(resolved.document.id, resolved.version.id);
      if (!(await s3ObjectExists(zipKey))) {
        return reply.code(404).send({ error: 'Экспорт страниц ещё не готов' });
      }
      const expiresInSeconds = 3600;
      const url = await getPresignedGetUrl({ key: zipKey, expiresInSeconds });
      return { url, expiresInSeconds };
    },
  );
};
