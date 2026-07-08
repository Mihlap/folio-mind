import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  DOCUMENT_VERSION_LABELS,
  UPLOAD_NETWORK_ERROR_MESSAGE,
  isUserUploadedSourceDocxKey,
} from '@folio-mind/pdf-contracts';
import { findDocumentForUser, getAuthUser } from '../../lib/documents/document-access.js';
import type { Env } from '../../lib/config/env.js';
import {
  getPresignedPutUrl,
  isS3Configured,
  isS3NetworkError,
  putObjectByKey,
  s3ObjectExists,
} from '../../lib/storage/s3.js';
import { buildOriginalKey, finalizeDocumentUpload, hashBuffer } from './helpers.js';
import { enqueueImportFromDocxJob } from '../../lib/queue/queue.js';
import { errorBody, MAX_UPLOAD_BYTES, uploadRateLimit } from './schemas.js';
export const registerVersionsRoutes: FastifyPluginAsync<{
  env: Env;
}> = async (app, opts) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const env = opts.env;
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
          docxFileName: z.string().max(255).optional(),
        }),
        response: {
          201: z.object({
            versionId: z.string(),
            version: z.number(),
            s3Key: z.string(),
            uploadUrl: z.string(),
            docxUploadUrl: z.string().optional(),
            docxS3Key: z.string().optional(),
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
      const { fileName, mimeType, size, docxFileName } = request.body;
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
      let docxUploadUrl: string | undefined;
      let docxS3Key: string | undefined;
      if (docxFileName && docxFileName.toLowerCase().endsWith('.docx')) {
        docxS3Key = buildOriginalKey(document.id, version.version, docxFileName);
        docxUploadUrl = await getPresignedPutUrl({
          key: docxS3Key,
          contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        });
        await app.prisma.documentVersion.update({
          where: { id: version.id },
          data: { sourceDocxKey: docxS3Key },
        });
      }
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
          meta: {
            versionId: version.id,
            version: nextVersionNumber,
            fileName,
            size,
            hasDocx: Boolean(docxFileName),
          },
        },
      });
      return reply.status(201).send({
        versionId: version.id,
        version: nextVersionNumber,
        s3Key,
        uploadUrl,
        docxUploadUrl,
        docxS3Key,
      });
    },
  );
  r.patch(
    '/documents/:documentId/versions/:versionId/label',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({
          documentId: z.string(),
          versionId: z.string(),
        }),
        body: z.object({
          versionLabel: z
            .enum([...DOCUMENT_VERSION_LABELS] as [string, ...string[]])
            .nullable(),
        }),
        response: {
          200: z.object({
            versionId: z.string(),
            versionLabel: z.string().nullable(),
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
      await app.prisma.documentVersion.update({
        where: { id: versionId },
        data: { versionLabel: request.body.versionLabel },
      });
      await app.prisma.auditLog.create({
        data: {
          action: 'document.version_label_update',
          userId: user.sub,
          tenantId: user.tenantId,
          documentId,
          meta: {
            versionId,
            versionLabel: request.body.versionLabel,
          },
        },
      });
      return {
        versionId,
        versionLabel: request.body.versionLabel,
      };
    },
  );
  r.post(
    '/documents/:documentId/versions/from-docx',
    {
      preHandler: [app.authenticate],
      config: uploadRateLimit,
      schema: {
        params: z.object({ documentId: z.string() }),
        body: z.object({
          fileName: z.string().min(1).max(255),
          size: z.number().int().positive().max(MAX_UPLOAD_BYTES),
        }),
        response: {
          201: z.object({
            versionId: z.string(),
            version: z.number(),
            docxUploadUrl: z.string(),
            docxS3Key: z.string(),
            pdfS3Key: z.string(),
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
      if (!env.GOTENBERG_URL) {
        return reply.code(503).send({
          error: 'Конвертация DOCX→PDF недоступна. Запустите Gotenberg (docker compose, :3003).',
        });
      }
      const user = getAuthUser(request);
      const { documentId } = request.params;
      const { fileName, size } = request.body;
      if (!fileName.toLowerCase().endsWith('.docx')) {
        return reply.code(400).send({ error: 'Only DOCX files are supported' });
      }
      const document = await findDocumentForUser(app.prisma, documentId, user);
      if (!document) {
        return reply.code(404).send({ error: 'Document not found' });
      }
      const latestVersionNumber = document.versions[0]?.version ?? 0;
      const nextVersionNumber = latestVersionNumber + 1;
      const pdfFileName = fileName.replace(/\.docx$/i, '.pdf');
      const version = await app.prisma.documentVersion.create({
        data: {
          documentId: document.id,
          version: nextVersionNumber,
          s3Key: 'pending',
          size: BigInt(size),
          mimeType: 'application/pdf',
          status: 'pending_upload',
        },
      });
      const docxS3Key = buildOriginalKey(document.id, version.version, fileName);
      const pdfS3Key = buildOriginalKey(document.id, version.version, pdfFileName);
      await app.prisma.documentVersion.update({
        where: { id: version.id },
        data: { s3Key: pdfS3Key, sourceDocxKey: docxS3Key },
      });
      const docxUploadUrl = await getPresignedPutUrl({
        key: docxS3Key,
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      await app.prisma.document.update({
        where: { id: document.id },
        data: { updatedAt: new Date() },
      });
      await app.prisma.auditLog.create({
        data: {
          action: 'document.version_create_from_docx',
          userId: user.sub,
          tenantId: user.tenantId,
          documentId: document.id,
          meta: { versionId: version.id, version: nextVersionNumber, fileName, size },
        },
      });
      return reply.status(201).send({
        versionId: version.id,
        version: nextVersionNumber,
        docxUploadUrl,
        docxS3Key,
        pdfS3Key,
      });
    },
  );
  r.post(
    '/documents/:documentId/versions/:versionId/attach-source-docx',
    {
      preHandler: [app.authenticate],
      config: uploadRateLimit,
      schema: {
        params: z.object({
          documentId: z.string(),
          versionId: z.string(),
        }),
        body: z.object({
          fileName: z.string().min(1).max(255),
        }),
        response: {
          200: z.object({
            docxS3Key: z.string(),
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
      const { documentId, versionId } = request.params;
      const { fileName } = request.body;
      if (!fileName.toLowerCase().endsWith('.docx')) {
        return reply.code(400).send({ error: 'Only DOCX files are supported' });
      }
      const document = await findDocumentForUser(app.prisma, documentId, user);
      if (!document) {
        return reply.code(404).send({ error: 'Document not found' });
      }
      const version = document.versions.find((v: { id: string }) => v.id === versionId);
      if (!version || version.status === 'pending_upload') {
        return reply.code(404).send({ error: 'Version not found' });
      }
      if (isUserUploadedSourceDocxKey(version.sourceDocxKey)) {
        return reply.code(400).send({ error: 'У версии уже есть исходный DOCX' });
      }
      const docxS3Key = buildOriginalKey(document.id, version.version, fileName);
      const uploadUrl = await getPresignedPutUrl({
        key: docxS3Key,
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      await app.prisma.documentVersion.update({
        where: { id: versionId },
        data: { sourceDocxKey: docxS3Key },
      });
      return { docxS3Key, uploadUrl };
    },
  );
  r.post(
    '/documents/:documentId/versions/:versionId/source-docx-complete',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({
          documentId: z.string(),
          versionId: z.string(),
        }),
        body: z.object({
          docxS3Key: z.string().min(1),
        }),
        response: {
          200: z.object({ sourceDocxKey: z.string() }),
          400: errorBody,
          404: errorBody,
        },
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const { documentId, versionId } = request.params;
      const { docxS3Key } = request.body;
      const document = await findDocumentForUser(app.prisma, documentId, user);
      if (!document) {
        return reply.code(404).send({ error: 'Document not found' });
      }
      const version = document.versions.find((v: { id: string }) => v.id === versionId);
      if (!version) {
        return reply.code(404).send({ error: 'Version not found' });
      }
      await app.prisma.documentVersion.update({
        where: { id: versionId },
        data: { sourceDocxKey: docxS3Key },
      });
      return { sourceDocxKey: docxS3Key };
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
      if (version.status !== 'pending_upload') {
        return reply.code(400).send({ error: 'Version already uploaded' });
      }
      if (isS3Configured() && !(await s3ObjectExists(version.s3Key))) {
        return reply.code(400).send({
          error: 'Файл не найден в хранилище. Повторите загрузку или используйте прокси-загрузку.',
        });
      }
      try {
        return await finalizeDocumentUpload({
          prisma: app.prisma,
          env,
          user,
          documentId,
          versionId,
          version,
          sha256: request.body.sha256,
          requestId: request.requestId,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload finalize failed';
        return reply.code(400).send({ error: message });
      }
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
      try {
        await putObjectByKey({
          key: version.s3Key,
          body: buffer,
          contentType: mime,
        });
        return await finalizeDocumentUpload({
          prisma: app.prisma,
          env,
          user,
          documentId,
          versionId,
          version,
          sha256: hashBuffer(buffer),
          requestId: request.requestId,
        });
      } catch (err) {
        request.log.error({ err, documentId, versionId }, 'PDF proxy upload failed');
        if (isS3NetworkError(err)) {
          return reply.code(503).send({ error: UPLOAD_NETWORK_ERROR_MESSAGE });
        }
        throw err;
      }
    },
  );
  r.post(
    '/documents/:documentId/versions/:versionId/source-docx-upload',
    {
      preHandler: [app.authenticate],
      config: uploadRateLimit,
      schema: {
        params: z.object({
          documentId: z.string(),
          versionId: z.string(),
        }),
        response: {
          200: z.object({ sourceDocxKey: z.string() }),
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
      const docxKey = version.sourceDocxKey;
      if (!docxKey || !isUserUploadedSourceDocxKey(docxKey)) {
        return reply.code(400).send({ error: 'DOCX для этой версии не запланирован' });
      }
      const file = await request.file();
      if (!file) {
        return reply.code(400).send({ error: 'DOCX file is required' });
      }
      const mime =
        file.mimetype || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      if (!file.filename?.toLowerCase().endsWith('.docx')) {
        return reply.code(400).send({ error: 'Only DOCX files are supported' });
      }
      const buffer = await file.toBuffer();
      if (buffer.length > MAX_UPLOAD_BYTES) {
        return reply.code(413).send({ error: 'File too large' });
      }
      try {
        await putObjectByKey({
          key: docxKey,
          body: buffer,
          contentType: mime,
        });
        await app.prisma.documentVersion.update({
          where: { id: versionId },
          data: { sourceDocxKey: docxKey },
        });
        return { sourceDocxKey: docxKey };
      } catch (err) {
        request.log.error({ err, documentId, versionId }, 'DOCX proxy upload failed');
        if (isS3NetworkError(err)) {
          return reply.code(503).send({ error: UPLOAD_NETWORK_ERROR_MESSAGE });
        }
        throw err;
      }
    },
  );
  r.post(
    '/documents/:documentId/versions/:versionId/import-from-docx',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({
          documentId: z.string(),
          versionId: z.string(),
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
      if (!env.GOTENBERG_URL) {
        return reply.code(503).send({
          error: 'Конвертация DOCX→PDF недоступна. Запустите Gotenberg (docker compose, :3003).',
        });
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
      const sourceDocxKey = version.sourceDocxKey;
      if (!sourceDocxKey || !isUserUploadedSourceDocxKey(sourceDocxKey)) {
        return reply.code(400).send({ error: 'Исходный DOCX не загружен' });
      }
      if (!(await s3ObjectExists(sourceDocxKey))) {
        return reply.code(400).send({ error: 'DOCX не найден в хранилище — повторите загрузку' });
      }
      if (version.status !== 'pending_upload' && version.status !== 'processing') {
        return reply.code(400).send({ error: 'Импорт из DOCX недоступен для этой версии' });
      }
      const operationJob = await app.prisma.job.create({
        data: {
          type: 'import-from-docx',
          status: 'queued',
          tenantId: user.tenantId,
          payload: { documentId, versionId, sourceDocxKey, targetS3Key: version.s3Key },
        },
      });
      const workerJob = await app.prisma.job.create({
        data: {
          type: 'import-from-docx',
          status: 'queued',
          tenantId: user.tenantId,
          payload: {
            operationJobId: operationJob.id,
            documentId,
            versionId,
            sourceDocxKey,
            targetS3Key: version.s3Key,
          },
        },
      });
      await app.prisma.documentVersion.update({
        where: { id: versionId },
        data: { status: 'processing' },
      });
      await enqueueImportFromDocxJob(env, {
        jobId: workerJob.id,
        operationJobId: operationJob.id,
        documentId,
        versionId,
        tenantId: user.tenantId,
        sourceDocxKey,
        targetS3Key: version.s3Key,
        requestId: request.requestId,
      });
      await app.prisma.auditLog.create({
        data: {
          action: 'document.import_from_docx',
          userId: user.sub,
          tenantId: user.tenantId,
          documentId,
          meta: { versionId, sourceDocxKey },
        },
      });
      return reply.status(202).send({
        operationJobId: operationJob.id,
        versionId,
        status: 'processing',
      });
    },
  );
};
