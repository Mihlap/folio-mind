import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { resolveS3Key } from '@folio-mind/pdf-contracts';
import { getAuthUser } from '../lib/documents/document-access.js';
import type { Env } from '../lib/config/env.js';
import { UPLOAD_RATE_LIMIT } from '../lib/auth/rate-limits.js';
import { enqueueRagIndexJob } from '../lib/queue/queue.js';
import { searchRagChunks } from '../lib/rag/rag-search.js';
import { deleteObjectByKey, isS3Configured, putObjectByKey } from '../lib/storage/s3.js';
const errorBody = z.object({ error: z.string() });
const uploadRateLimit = { rateLimit: UPLOAD_RATE_LIMIT };
const MAX_RAG_BYTES = 20 * 1024 * 1024;
function buildRagKey(tenantId: string, sourceId: string, fileName: string) {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return resolveS3Key('ragSources', `${tenantId}/${sourceId}/${safeName}`);
}
export const ragRoutes: FastifyPluginAsync<{
  env: Env;
}> = async (app, opts) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const env = opts.env;
  r.get(
    '/rag/sources',
    {
      preHandler: [app.authenticate],
      schema: {
        response: {
          200: z.object({
            items: z.array(
              z.object({
                id: z.string(),
                title: z.string(),
                fileName: z.string(),
                status: z.string(),
                chunkCount: z.number(),
                createdAt: z.string(),
              }),
            ),
          }),
        },
      },
    },
    async (request) => {
      const user = getAuthUser(request);
      const items = await app.prisma.ragSource.findMany({
        where: { tenantId: user.tenantId },
        orderBy: { createdAt: 'desc' },
      });
      return {
        items: items.map((item) => ({
          id: item.id,
          title: item.title,
          fileName: item.fileName,
          status: item.status,
          chunkCount: item.chunkCount,
          createdAt: item.createdAt.toISOString(),
        })),
      };
    },
  );
  r.post(
    '/rag/sources',
    {
      preHandler: [app.authenticate],
      config: uploadRateLimit,
      schema: {
        body: z.object({
          title: z.string().min(1).max(255),
          fileName: z.string().min(1).max(255),
          mimeType: z.string(),
          size: z.number().int().positive().max(MAX_RAG_BYTES),
        }),
        response: {
          201: z.object({
            sourceId: z.string(),
            uploadUrl: z.string().optional(),
            status: z.string(),
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
      const lower = fileName.toLowerCase();
      const allowed =
        mimeType === 'text/plain' ||
        lower.endsWith('.txt') ||
        mimeType === 'application/pdf' ||
        lower.endsWith('.pdf');
      if (!allowed) {
        return reply.code(400).send({ error: 'Поддерживаются PDF и TXT' });
      }
      const source = await app.prisma.ragSource.create({
        data: {
          tenantId: user.tenantId,
          title,
          fileName,
          s3Key: 'pending',
          status: 'pending_upload',
        },
      });
      const s3Key = buildRagKey(user.tenantId, source.id, fileName);
      await app.prisma.ragSource.update({
        where: { id: source.id },
        data: { s3Key },
      });
      const { getPresignedPutUrl } = await import('../lib/storage/s3.js');
      const uploadUrl = await getPresignedPutUrl({
        key: s3Key,
        contentType: mimeType || 'application/octet-stream',
      });
      await app.prisma.auditLog.create({
        data: {
          action: 'rag.source_created',
          userId: user.sub,
          tenantId: user.tenantId,
          meta: { sourceId: source.id, title, size },
        },
      });
      return reply.status(201).send({
        sourceId: source.id,
        uploadUrl,
        status: 'pending_upload',
      });
    },
  );
  r.post(
    '/rag/sources/:sourceId/complete',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ sourceId: z.string() }),
        response: {
          200: z.object({ sourceId: z.string(), status: z.string(), jobId: z.string() }),
          404: errorBody,
          503: errorBody,
        },
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const { sourceId } = request.params;
      const source = await app.prisma.ragSource.findFirst({
        where: { id: sourceId, tenantId: user.tenantId },
      });
      if (!source || source.s3Key === 'pending') {
        return reply.code(404).send({ error: 'Source not found' });
      }
      const job = await app.prisma.job.create({
        data: {
          type: 'rag-index',
          status: 'queued',
          tenantId: user.tenantId,
          payload: { sourceId, s3Key: source.s3Key, fileName: source.fileName },
        },
      });
      await app.prisma.ragSource.update({
        where: { id: sourceId },
        data: { status: 'processing' },
      });
      await enqueueRagIndexJob(env, {
        jobId: job.id,
        sourceId,
        tenantId: user.tenantId,
        s3Key: source.s3Key,
        fileName: source.fileName,
        requestId: request.requestId,
      });
      return { sourceId, status: 'processing', jobId: job.id };
    },
  );
  r.delete(
    '/rag/sources/:sourceId',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ sourceId: z.string() }),
        response: { 204: z.null(), 404: errorBody },
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const source = await app.prisma.ragSource.findFirst({
        where: { id: request.params.sourceId, tenantId: user.tenantId },
      });
      if (!source) {
        return reply.code(404).send({ error: 'Source not found' });
      }
      if (source.s3Key && source.s3Key !== 'pending') {
        try {
          await deleteObjectByKey(source.s3Key);
        } catch {
          // Keep source deletion available even if object cleanup has already happened.
        }
      }
      await app.prisma.ragSource.delete({ where: { id: source.id } });
      return reply.status(204).send(null);
    },
  );
  r.post(
    '/rag/query',
    {
      preHandler: [app.authenticate],
      schema: {
        body: z.object({
          query: z.string().min(1).max(2000),
          limit: z.number().int().min(1).max(20).optional(),
        }),
        response: {
          200: z.object({
            chunks: z.array(
              z.object({
                id: z.string(),
                sourceId: z.string(),
                sourceTitle: z.string(),
                chunkIndex: z.number(),
                content: z.string(),
              }),
            ),
          }),
        },
      },
    },
    async (request) => {
      const user = getAuthUser(request);
      const chunks = await searchRagChunks(
        app.prisma,
        user.tenantId,
        request.body.query,
        request.body.limit ?? 8,
      );
      return {
        chunks: chunks.map((c) => ({
          id: c.id,
          sourceId: c.sourceId,
          sourceTitle: c.source.title,
          chunkIndex: c.chunkIndex,
          content: c.content,
        })),
      };
    },
  );
  r.post(
    '/rag/sources/:sourceId/upload',
    {
      preHandler: [app.authenticate],
      config: uploadRateLimit,
      schema: {
        params: z.object({ sourceId: z.string() }),
        response: {
          200: z.object({ sourceId: z.string(), status: z.string(), jobId: z.string() }),
          400: errorBody,
          404: errorBody,
        },
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const { sourceId } = request.params;
      const source = await app.prisma.ragSource.findFirst({
        where: { id: sourceId, tenantId: user.tenantId },
      });
      if (!source) {
        return reply.code(404).send({ error: 'Source not found' });
      }
      const file = await request.file();
      if (!file) {
        return reply.code(400).send({ error: 'File is required' });
      }
      const buffer = await file.toBuffer();
      if (buffer.length > MAX_RAG_BYTES) {
        return reply.code(400).send({ error: 'File too large' });
      }
      await putObjectByKey({
        key: source.s3Key,
        body: buffer,
        contentType: file.mimetype || 'application/octet-stream',
      });
      const job = await app.prisma.job.create({
        data: {
          type: 'rag-index',
          status: 'queued',
          tenantId: user.tenantId,
          payload: { sourceId, s3Key: source.s3Key, fileName: source.fileName },
        },
      });
      await app.prisma.ragSource.update({
        where: { id: sourceId },
        data: { status: 'processing' },
      });
      await enqueueRagIndexJob(env, {
        jobId: job.id,
        sourceId,
        tenantId: user.tenantId,
        s3Key: source.s3Key,
        fileName: source.fileName,
        requestId: request.requestId,
      });
      return { sourceId, status: 'processing', jobId: job.id };
    },
  );
};
