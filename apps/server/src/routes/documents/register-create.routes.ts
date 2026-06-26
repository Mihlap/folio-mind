import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getAuthUser } from '../../lib/documents/document-access.js';
import type { Env } from '../../lib/config/env.js';
import { getPresignedPutUrl, isS3Configured } from '../../lib/storage/s3.js';
import { buildOriginalKey } from './helpers.js';
import { documentSchema, errorBody, MAX_UPLOAD_BYTES, uploadRateLimit } from './schemas.js';
export const registerCreateRoutes: FastifyPluginAsync<{
  env: Env;
}> = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
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
          docxFileName: z.string().max(255).optional(),
        }),
        response: {
          201: z.object({
            document: documentSchema,
            versionId: z.string(),
            uploadUrl: z.string(),
            s3Key: z.string(),
            docxUploadUrl: z.string().optional(),
            docxS3Key: z.string().optional(),
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
      const { title, fileName, mimeType, size, docxFileName } = request.body;
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
      let docxS3Key: string | undefined;
      if (docxFileName && docxFileName.toLowerCase().endsWith('.docx')) {
        docxS3Key = buildOriginalKey(document.id, version.version, docxFileName);
      }
      await app.prisma.documentVersion.update({
        where: { id: version.id },
        data: {
          s3Key,
          ...(docxS3Key ? { sourceDocxKey: docxS3Key } : {}),
        },
      });
      const uploadUrl = await getPresignedPutUrl({
        key: s3Key,
        contentType: mimeType,
      });
      let docxUploadUrl: string | undefined;
      if (docxS3Key) {
        docxUploadUrl = await getPresignedPutUrl({
          key: docxS3Key,
          contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        });
      }
      await app.prisma.auditLog.create({
        data: {
          action: 'document.create',
          userId: user.sub,
          tenantId: user.tenantId,
          documentId: document.id,
          meta: { fileName, size, hasDocx: Boolean(docxFileName) },
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
            sourceDocxKey: docxS3Key ?? null,
          },
        },
        versionId: version.id,
        uploadUrl,
        s3Key,
        docxUploadUrl,
        docxS3Key,
      });
    },
  );
};
