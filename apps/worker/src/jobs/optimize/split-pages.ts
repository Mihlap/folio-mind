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
  replaceInPlace?: boolean;
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
    replaceInPlace = false,
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
  let originalPdfBuffer: Buffer | null = null;
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
    const sourcePdfBuffer = await getObjectBuffer(sourceS3Key);
    originalPdfBuffer = sourcePdfBuffer;
    const sourcePdf = await PDFDocument.load(sourcePdfBuffer);
    const sourcePageCount = sourcePdf.getPageCount();
    const hasBlankPages = pages.some((page) => page === 0);
    for (const page of pages) {
      if (page === 0) continue;
      if (page < 1 || page > sourcePageCount) {
        throw new Error(`Page ${page} out of range 1..${sourcePageCount}`);
      }
    }
    const outputPdf = await PDFDocument.create();
    if (hasBlankPages) {
      const { width, height } = sourcePdf.getPage(0).getSize();
      for (const page of pages) {
        if (page === 0) {
          outputPdf.addPage([width, height]);
          continue;
        }
        const [copied] = await outputPdf.copyPages(sourcePdf, [page - 1]);
        outputPdf.addPage(copied);
      }
    } else {
      const copiedPages = await outputPdf.copyPages(
        sourcePdf,
        pages.map((p) => p - 1),
      );
      copiedPages.forEach((page) => outputPdf.addPage(page));
    }
    const outputBytes = await outputPdf.save();
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
          replaceInPlace,
          message: replaceInPlace
            ? `Порядок страниц сохранён в текущую версию (${pages.length} стр.)`
            : `Новая версия: ${pages.length} стр.`,
        },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Split pages failed';
    if (replaceInPlace && sourceS3Key === targetS3Key && originalPdfBuffer) {
      try {
        await putObjectBuffer({
          key: targetS3Key,
          body: originalPdfBuffer,
          contentType: 'application/pdf',
        });
      } catch {
        // Restore is best-effort; the failure marker below keeps the version out of ready state.
      }
    } else {
      try {
        await deleteObjectByKey(targetS3Key);
      } catch {
        // Cleanup is best-effort; keep the original job failure visible.
      }
    }
    try {
      await failOptimizeOperation({
        operationJobId,
        targetVersionId,
        error: message,
        payload: { documentId, sourceVersionId, pages },
      });
    } catch {
      // Preserve the original error if the failure marker cannot be written.
    }
    throw err;
  }
}
