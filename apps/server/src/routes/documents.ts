import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { findDocumentForUser, getAuthUser } from '../lib/document-access.js';
import { deleteCachedSummaries } from '../lib/ai-cache.js';
import type { Env } from '../lib/env.js';
import { clampPreviewRange } from '../lib/preview-config.js';
import { UPLOAD_RATE_LIMIT } from '../lib/rate-limits.js';
import { enqueuePreviewJob, enqueuePreviewPagesJob } from '../lib/queue.js';
import { extractedTextKey, exportReportKey, exportReportWordKey, previewPageKey } from '@folio-mind/pdf-contracts';
import {
  deleteObjectByKey,
  deleteObjectsByPrefix,
  deleteDocumentArtifacts,
  getObjectReadable,
  getPresignedGetUrl,
  getPresignedPutUrl,
  isS3Configured,
  putObjectByKey,
  resolveS3Key,
  s3ObjectExists,
} from '../lib/s3.js';

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
          await deleteObjectByKey(version.s3Key);
          await deleteObjectByKey(extractedTextKey(documentId, versionId));
          await deleteObjectByKey(exportReportKey(documentId, versionId));
          await deleteObjectByKey(exportReportWordKey(documentId, versionId));
          await deleteObjectsByPrefix(resolveS3Key('previews', `${documentId}/${versionId}`));
        } catch {
          // часть объектов могла отсутствовать
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
            versions: z.array(
              z.object({
                id: z.string(),
                version: z.number(),
                status: z.string(),
                size: z.string(),
                mimeType: z.string(),
                createdAt: z.string(),
              }),
            ),
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
          createdAt: Date;
        }) => ({
          id: v.id,
          version: v.version,
          status: v.status,
          size: v.size.toString(),
          mimeType: v.mimeType,
          createdAt: v.createdAt.toISOString(),
        })),
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

      const { body, contentType, contentLength } = await getObjectReadable(version.s3Key);

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

      if (version.status === 'processing') {
        return { pageCount: 0, pages: [], status: 'processing' as const };
      }

      const pageCount = version.pageCount ?? 0;
      if (!pageCount) {
        return { pageCount: 0, pages: [], status: 'unavailable' as const };
      }

      const { from, to } = clampPreviewRange(
        env,
        pageCount,
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
};

export function hashBuffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}
