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

type SplitPagesPayload = WorkerJobPayload & {
  operationJobId?: string;
  documentId?: string;
  sourceVersionId?: string;
  targetVersionId?: string;
  sourceS3Key?: string;
  targetS3Key?: string;
  pages?: number[];
};

export async function processSplitPagesJob(env: WorkerEnv, data: SplitPagesPayload): Promise<void> {
  const {
    operationJobId,
    documentId,
    sourceVersionId,
    targetVersionId,
    sourceS3Key,
    targetS3Key,
    pages,
    requestId,
  } = data;

  if (
    !operationJobId ||
    !documentId ||
    !sourceVersionId ||
    !targetVersionId ||
    !sourceS3Key ||
    !targetS3Key ||
    !pages ||
    pages.length === 0
  ) {
    throw new Error('Split pages job: missing required payload fields');
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
        data: { status: 'completed', payload: { skipped: 'version_deleted' } },
      });
      return;
    }

    const sourcePdfBuffer = await getObjectBuffer(sourceS3Key);
    const sourcePdf = await PDFDocument.load(sourcePdfBuffer);
    const sourcePageCount = sourcePdf.getPageCount();
    for (const page of pages) {
      if (page < 1 || page > sourcePageCount) {
        throw new Error(`Page ${page} out of range 1..${sourcePageCount}`);
      }
    }

    const outputPdf = await PDFDocument.create();
    const copiedPages = await outputPdf.copyPages(
      sourcePdf,
      pages.map((p) => p - 1),
    );
    copiedPages.forEach((page) => outputPdf.addPage(page));
    const outputBytes = await outputPdf.save();
    const outputBuffer = Buffer.from(outputBytes);

    const existsBeforeUpload = await prisma.documentVersion.findUnique({
      where: { id: targetVersionId },
      select: { id: true },
    });
    if (!existsBeforeUpload) {
      await prisma.job.update({
        where: { id: operationJobId },
        data: { status: 'completed', payload: { skipped: 'version_deleted' } },
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
      pageCount: pages.length,
      operation: 'split-pages',
      operationMeta: { sourceVersionId },
      requestId,
    });

    await prisma.job.update({
      where: { id: operationJobId },
      data: {
        status: 'completed',
        payload: {
          documentId,
          sourceVersionId,
          targetVersionId,
          sourceS3Key,
          targetS3Key,
          pages,
          previewJobId,
        },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Split pages failed';
    try {
      await deleteObjectByKey(targetS3Key);
    } catch {
      // часть S3 объектов могла уже быть удалена/не создана
    }
    try {
      await failOptimizeOperation({
        operationJobId,
        targetVersionId,
        error: message,
        payload: { documentId, sourceVersionId, pages },
      });
    } catch {
      // версия могла быть удалена в момент выполнения
    }
    throw err;
  }
}
