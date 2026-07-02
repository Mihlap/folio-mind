import { mediaAssetKey, UPLOAD_NETWORK_ERROR_MESSAGE } from '@folio-mind/pdf-contracts';
import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { findDocumentForUser, getAuthUser } from '../lib/documents/document-access.js';
import {
  deleteObjectByKey,
  getObjectBuffer,
  getPresignedGetUrl,
  getPresignedPutUrl,
  isS3Configured,
  isS3NetworkError,
  putObjectByKey,
  s3ObjectExists,
} from '../lib/storage/s3.js';
import { errorBody, MAX_UPLOAD_BYTES, uploadRateLimit } from './documents/schemas.js';

const IMAGE_MIME = /^image\/(png|jpeg|jpg|webp|gif|bmp)$/i;

const mediaAssetSchema = z.object({
  id: z.string(),
  title: z.string(),
  fileName: z.string(),
  mimeType: z.string(),
  size: z.string(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  documentId: z.string().nullable(),
  status: z.string(),
  previewUrl: z.string().nullable(),
  createdAt: z.string(),
});

function isImageFileName(fileName: string): boolean {
  return /\.(png|jpe?g|webp|gif|bmp)$/i.test(fileName);
}

async function serializeMediaAsset(item: {
  id: string;
  title: string;
  fileName: string;
  mimeType: string;
  size: bigint;
  width: number | null;
  height: number | null;
  documentId: string | null;
  status: string;
  s3Key: string;
  createdAt: Date;
}) {
  return {
    id: item.id,
    title: item.title,
    fileName: item.fileName,
    mimeType: item.mimeType,
    size: item.size.toString(),
    width: item.width,
    height: item.height,
    documentId: item.documentId,
    status: item.status,
    previewUrl:
      item.status === 'ready' && item.s3Key !== 'pending'
        ? await getPresignedGetUrl({ key: item.s3Key, expiresInSeconds: 3600 })
        : null,
    createdAt: item.createdAt.toISOString(),
  };
}

async function waitForS3Object(key: string, attempts = 5, delayMs = 400): Promise<boolean> {
  for (let i = 0; i < attempts; i += 1) {
    if (await s3ObjectExists(key)) return true;
    if (i < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return false;
}

export const mediaRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/media-assets',
    {
      preHandler: [app.authenticate],
      schema: {
        querystring: z.object({
          documentId: z.string().optional(),
        }),
        response: {
          200: z.object({ items: z.array(mediaAssetSchema) }),
          404: errorBody,
        },
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const { documentId } = request.query;

      if (documentId) {
        const document = await findDocumentForUser(app.prisma, documentId, user);
        if (!document) {
          return reply.code(404).send({ error: 'Document not found' });
        }
      }

      const items = await app.prisma.mediaAsset.findMany({
        where: {
          tenantId: user.tenantId,
          status: 'ready',
          ...(documentId
            ? { OR: [{ documentId }, { documentId: null }] }
            : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });

      const mapped = await Promise.all(items.map((item) => serializeMediaAsset(item)));

      return { items: mapped };
    },
  );

  r.post(
    '/media-assets',
    {
      preHandler: [app.authenticate],
      config: uploadRateLimit,
      schema: {
        body: z.object({
          title: z.string().min(1).max(200).optional(),
          fileName: z.string().min(1).max(255),
          mimeType: z.string().min(1).max(120),
          size: z.number().int().positive().max(MAX_UPLOAD_BYTES),
          documentId: z.string().optional(),
          width: z.number().int().positive().max(20000).optional(),
          height: z.number().int().positive().max(20000).optional(),
        }),
        response: {
          201: z.object({
            id: z.string(),
            uploadUrl: z.string(),
            s3Key: z.string(),
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
      const { fileName, mimeType, size, documentId, width, height } = request.body;

      if (!IMAGE_MIME.test(mimeType) && !isImageFileName(fileName)) {
        return reply.code(400).send({ error: 'Поддерживаются только изображения' });
      }

      if (documentId) {
        const document = await findDocumentForUser(app.prisma, documentId, user);
        if (!document) {
          return reply.code(404).send({ error: 'Document not found' });
        }
      }

      const title = request.body.title?.trim() || fileName.replace(/\.[^.]+$/, '');
      const asset = await app.prisma.mediaAsset.create({
        data: {
          tenantId: user.tenantId,
          documentId: documentId ?? null,
          title,
          fileName,
          mimeType,
          size: BigInt(size),
          width: width ?? null,
          height: height ?? null,
          s3Key: 'pending',
          status: 'pending_upload',
        },
      });

      const s3Key = mediaAssetKey(user.tenantId, asset.id, fileName);
      await app.prisma.mediaAsset.update({
        where: { id: asset.id },
        data: { s3Key },
      });

      const uploadUrl = await getPresignedPutUrl({ key: s3Key, contentType: mimeType });

      await app.prisma.auditLog.create({
        data: {
          action: 'media.asset_created',
          userId: user.sub,
          tenantId: user.tenantId,
          documentId: documentId ?? null,
          meta: { mediaAssetId: asset.id, fileName, size },
        },
      });

      return reply.status(201).send({ id: asset.id, uploadUrl, s3Key });
    },
  );

  r.post(
    '/media-assets/:assetId/complete',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ assetId: z.string() }),
        response: {
          200: mediaAssetSchema,
          404: errorBody,
          400: errorBody,
        },
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const asset = await app.prisma.mediaAsset.findFirst({
        where: { id: request.params.assetId, tenantId: user.tenantId },
      });
      if (!asset) {
        return reply.code(404).send({ error: 'Asset not found' });
      }
      if (asset.status !== 'pending_upload') {
        return reply.code(400).send({ error: 'Asset already completed' });
      }
      if (!(await waitForS3Object(asset.s3Key))) {
        return reply.code(400).send({ error: 'Файл не найден в хранилище' });
      }

      const updated = await app.prisma.mediaAsset.update({
        where: { id: asset.id },
        data: { status: 'ready' },
      });

      return serializeMediaAsset(updated);
    },
  );

  r.post(
    '/media-assets/:assetId/upload',
    {
      preHandler: [app.authenticate],
      config: uploadRateLimit,
      schema: {
        params: z.object({ assetId: z.string() }),
        response: {
          200: mediaAssetSchema,
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
      const asset = await app.prisma.mediaAsset.findFirst({
        where: { id: request.params.assetId, tenantId: user.tenantId },
      });
      if (!asset) {
        return reply.code(404).send({ error: 'Asset not found' });
      }
      if (asset.status !== 'pending_upload') {
        return reply.code(400).send({ error: 'Asset already uploaded' });
      }

      const file = await request.file();
      if (!file) {
        return reply.code(400).send({ error: 'Image file is required' });
      }

      const mime = file.mimetype || asset.mimeType;
      const fileName = file.filename || asset.fileName;
      if (!IMAGE_MIME.test(mime) && !isImageFileName(fileName)) {
        return reply.code(400).send({ error: 'Поддерживаются только изображения' });
      }

      const buffer = await file.toBuffer();
      if (buffer.length > MAX_UPLOAD_BYTES) {
        return reply.code(413).send({ error: 'File too large' });
      }

      try {
        await putObjectByKey({
          key: asset.s3Key,
          body: buffer,
          contentType: mime,
        });
        const updated = await app.prisma.mediaAsset.update({
          where: { id: asset.id },
          data: {
            status: 'ready',
            size: BigInt(buffer.length),
            mimeType: mime,
            fileName,
          },
        });
        return serializeMediaAsset(updated);
      } catch (err) {
        request.log.error({ err, assetId: asset.id }, 'Media asset proxy upload failed');
        if (isS3NetworkError(err)) {
          return reply.code(503).send({ error: UPLOAD_NETWORK_ERROR_MESSAGE });
        }
        throw err;
      }
    },
  );

  r.get(
    '/media-assets/:assetId/content',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ assetId: z.string() }),
        response: { 404: errorBody, 503: errorBody },
      },
    },
    async (request, reply) => {
      if (!isS3Configured()) {
        return reply.code(503).send({ error: 'S3 is not configured' });
      }

      const user = getAuthUser(request);
      const asset = await app.prisma.mediaAsset.findFirst({
        where: { id: request.params.assetId, tenantId: user.tenantId, status: 'ready' },
      });
      if (!asset || asset.s3Key === 'pending') {
        return reply.code(404).send({ error: 'Asset not found' });
      }

      const buffer = await getObjectBuffer(asset.s3Key);
      return reply
        .header('Content-Type', asset.mimeType || 'application/octet-stream')
        .header('Cache-Control', 'private, max-age=3600')
        .send(buffer);
    },
  );

  r.delete(
    '/media-assets/:assetId',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ assetId: z.string() }),
        response: { 204: z.null(), 404: errorBody },
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const asset = await app.prisma.mediaAsset.findFirst({
        where: { id: request.params.assetId, tenantId: user.tenantId },
      });
      if (!asset) {
        return reply.code(404).send({ error: 'Asset not found' });
      }

      if (asset.s3Key && asset.s3Key !== 'pending') {
        try {
          await deleteObjectByKey(asset.s3Key);
        } catch {
          // best-effort: запись в БД всё равно удаляем
        }
      }

      await app.prisma.mediaAsset.delete({ where: { id: asset.id } });
      await app.prisma.auditLog.create({
        data: {
          action: 'media.asset_deleted',
          userId: user.sub,
          tenantId: user.tenantId,
          documentId: asset.documentId,
          meta: { mediaAssetId: asset.id },
        },
      });

      return reply.status(204).send(null);
    },
  );
};
