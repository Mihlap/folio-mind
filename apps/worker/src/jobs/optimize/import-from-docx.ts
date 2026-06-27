import { isUserUploadedSourceDocxKey } from '@folio-mind/pdf-contracts';
import type { WorkerJobPayload } from '../../lib/config/job-types.js';
import type { WorkerEnv } from '../../lib/config/env.js';
import { convertDocxToPdf, isGotenbergConfigured } from '../../lib/convert/gotenberg.js';
import { getPrisma } from '../../lib/infra/prisma.js';
import { createQueues, createRedisConnection } from '../../queue/queues.js';
import { getObjectBuffer, isWorkerS3Configured, putObjectBuffer } from '../../lib/storage/s3.js';
import { extractTextFromPdf } from '../../lib/pdf/pdf-text.js';

type ImportFromDocxPayload = WorkerJobPayload & {
  operationJobId?: string;
  documentId?: string;
  versionId?: string;
  sourceDocxKey?: string;
  targetS3Key?: string;
  requestId?: string;
};

export async function processImportFromDocxJob(
  env: WorkerEnv,
  data: ImportFromDocxPayload,
): Promise<void> {
  const { operationJobId, documentId, versionId, sourceDocxKey, targetS3Key, requestId } = data;
  if (!operationJobId || !documentId || !versionId || !sourceDocxKey || !targetS3Key) {
    throw new Error('import-from-docx: missing required fields');
  }
  if (!isWorkerS3Configured()) {
    throw new Error('S3 не настроен в worker');
  }
  if (!isGotenbergConfigured(env.GOTENBERG_URL)) {
    throw new Error('Gotenberg не настроен (GOTENBERG_URL)');
  }
  const prisma = getPrisma();
  await prisma.job.update({ where: { id: operationJobId }, data: { status: 'processing' } });
  try {
    const version = await prisma.documentVersion.findUnique({
      where: { id: versionId },
      select: { id: true, sourceDocxKey: true, status: true },
    });
    if (!version) {
      await prisma.job.update({
        where: { id: operationJobId },
        data: { status: 'completed', payload: { skipped: 'version_deleted' } },
      });
      return;
    }
    const docxBuffer = await getObjectBuffer(sourceDocxKey);
    const pdfBuffer = await convertDocxToPdf(docxBuffer);
    await putObjectBuffer({
      key: targetS3Key,
      body: pdfBuffer,
      contentType: 'application/pdf',
    });
    const extracted = await extractTextFromPdf(pdfBuffer);
    await prisma.documentVersion.update({
      where: { id: versionId },
      data: {
        status: 'processing',
        size: BigInt(pdfBuffer.length),
        pageCount: extracted.pageCount,
        mimeType: 'application/pdf',
        ...(isUserUploadedSourceDocxKey(sourceDocxKey)
          ? { sourceDocxKey }
          : {}),
      },
    });
    const previewJob = await prisma.job.create({
      data: {
        type: 'preview',
        status: 'queued',
        tenantId: data.tenantId ?? null,
        payload: { documentId, versionId, s3Key: targetS3Key, fromDocx: true },
      },
    });
    const connection = createRedisConnection(env.REDIS_URL);
    try {
      const queues = createQueues(connection);
      await queues.preview.add(
        'generate-previews',
        {
          jobId: previewJob.id,
          documentId,
          versionId,
          tenantId: data.tenantId,
          s3Key: targetS3Key,
          requestId,
        },
        { jobId: previewJob.id },
      );
    } finally {
      await connection.quit();
    }
    await prisma.job.update({
      where: { id: operationJobId },
      data: {
        status: 'completed',
        payload: {
          documentId,
          versionId,
          previewJobId: previewJob.id,
          pageCount: extracted.pageCount,
          status: 'success',
        },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'import-from-docx failed';
    await prisma.documentVersion.update({
      where: { id: versionId },
      data: { status: 'failed' },
    });
    await prisma.job.update({
      where: { id: operationJobId },
      data: { status: 'failed', payload: { error: message, documentId, versionId } },
    });
    throw err;
  }
}
