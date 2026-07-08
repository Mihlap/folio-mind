import { PDFDocument } from 'pdf-lib';
import type { WorkerJobPayload } from '../../lib/config/job-types.js';
import type { WorkerEnv } from '../../lib/config/env.js';
import { getPrisma } from '../../lib/infra/prisma.js';
import {
  failOptimizeOperation,
  finalizeOptimizeVersion,
} from '../../lib/pdf/finalize-optimize-version.js';
import {
  deleteObjectByKey,
  getObjectBuffer,
  isWorkerS3Configured,
  putObjectBuffer,
} from '../../lib/storage/s3.js';
type MergeVersionsPayload = WorkerJobPayload & {
  operationJobId?: string;
  documentId?: string;
  targetVersionId?: string;
  targetS3Key?: string;
  sourceS3Keys?: string[];
  sourceVersionIds?: string[];
};
export async function processMergeVersionsJob(
  env: WorkerEnv,
  data: MergeVersionsPayload,
): Promise<void> {
  const {
    operationJobId,
    documentId,
    targetVersionId,
    targetS3Key,
    sourceS3Keys,
    sourceVersionIds,
    requestId,
  } = data;
  if (
    !operationJobId ||
    !documentId ||
    !targetVersionId ||
    !targetS3Key ||
    !sourceS3Keys ||
    sourceS3Keys.length < 2 ||
    !sourceVersionIds ||
    sourceVersionIds.length < 2
  ) {
    throw new Error('Merge versions job: missing required payload fields');
  }
  const prisma = getPrisma();
  await prisma.job.update({ where: { id: operationJobId }, data: { status: 'processing' } });
  try {
    if (!isWorkerS3Configured()) {
      throw new Error('S3 не настроен в worker');
    }
    const exists = await prisma.documentVersion.findUnique({
      where: { id: targetVersionId },
      select: { id: true },
    });
    if (!exists) {
      await prisma.job.update({
        where: { id: operationJobId },
        data: {
          status: 'failed',
          payload: { skipped: 'version_deleted', error: 'Target version was deleted' },
        },
      });
      return;
    }
    const mergedPdf = await PDFDocument.create();
    let totalPages = 0;
    for (const sourceS3Key of sourceS3Keys) {
      const sourceBuffer = await getObjectBuffer(sourceS3Key);
      const sourcePdf = await PDFDocument.load(sourceBuffer);
      const pageIndices = sourcePdf.getPageIndices();
      const copiedPages = await mergedPdf.copyPages(sourcePdf, pageIndices);
      copiedPages.forEach((page) => mergedPdf.addPage(page));
      totalPages += pageIndices.length;
    }
    const outputBytes = await mergedPdf.save();
    const outputBuffer = Buffer.from(outputBytes);
    const existsBeforeUpload = await prisma.documentVersion.findUnique({
      where: { id: targetVersionId },
      select: { id: true },
    });
    if (!existsBeforeUpload) {
      await prisma.job.update({
        where: { id: operationJobId },
        data: {
          status: 'failed',
          payload: { skipped: 'version_deleted', error: 'Target version was deleted' },
        },
      });
      return;
    }
    await putObjectBuffer({
      key: targetS3Key,
      body: outputBuffer,
      contentType: 'application/pdf',
    });
    const previewJobId = await finalizeOptimizeVersion({
      env,
      data,
      documentId,
      targetVersionId,
      targetS3Key,
      outputBuffer,
      pageCount: totalPages,
      operation: 'merge-versions',
      operationMeta: { sourceVersionIds },
      requestId,
    });
    await prisma.job.update({
      where: { id: operationJobId },
      data: {
        status: 'completed',
        payload: {
          documentId,
          targetVersionId,
          targetS3Key,
          sourceVersionIds,
          sourceS3Keys,
          pageCount: totalPages,
          previewJobId,
        },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Merge versions failed';
    try {
      await deleteObjectByKey(targetS3Key);
    } catch {
      // Cleanup is best-effort; keep the original job failure visible.
    }
    try {
      await failOptimizeOperation({
        operationJobId,
        targetVersionId,
        error: message,
        payload: { documentId, sourceVersionIds, sourceS3Keys },
      });
    } catch {
      // Preserve the original error if the failure marker cannot be written.
    }
    throw err;
  }
}
