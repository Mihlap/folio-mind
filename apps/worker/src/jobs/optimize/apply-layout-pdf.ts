import type { LayoutImageObject } from '@folio-mind/pdf-contracts';
import type { WorkerJobPayload } from '../../lib/config/job-types.js';
import type { WorkerEnv } from '../../lib/config/env.js';
import { getPrisma } from '../../lib/infra/prisma.js';
import { applyLayoutToPdfBuffer } from '../../lib/pdf/apply-layout-pdf.js';
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

type ApplyLayoutPdfPayload = WorkerJobPayload & {
  operationJobId?: string;
  documentId?: string;
  sourceVersionId?: string;
  targetVersionId?: string;
  sourceS3Key?: string;
  targetS3Key?: string;
  layoutObjects?: LayoutImageObject[];
  blankInsertions?: Array<{ afterPage: number; count: number }>;
  pageChrome?: import('@folio-mind/pdf-contracts').LayoutPageChrome;
  replaceInPlace?: boolean;
};

export async function processApplyLayoutPdfJob(
  env: WorkerEnv,
  data: ApplyLayoutPdfPayload,
): Promise<void> {
  const {
    operationJobId,
    documentId,
    sourceVersionId,
    targetVersionId,
    sourceS3Key,
    targetS3Key,
    layoutObjects,
    blankInsertions = [],
    pageChrome,
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
    !layoutObjects ||
    layoutObjects.length === 0
  ) {
    throw new Error('Apply layout PDF job: missing required payload fields');
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

    const sourceBuffer = await getObjectBuffer(sourceS3Key);
    originalPdfBuffer = sourceBuffer;
    const applied = await applyLayoutToPdfBuffer(sourceBuffer, layoutObjects, blankInsertions, pageChrome);

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
      body: applied.buffer,
      contentType: 'application/pdf',
    });

    const previewJobId = await finalizeOptimizeVersion({
      env,
      data,
      documentId,
      targetVersionId,
      targetS3Key,
      outputBuffer: applied.buffer,
      pageCount: applied.pageCount,
      operation: 'apply-layout-pdf',
      operationMeta: {
        sourceVersionId,
        objectCount: layoutObjects.length,
        appliedCount: applied.appliedCount,
        skippedCount: applied.skippedCount,
      },
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
          objectCount: layoutObjects.length,
          appliedCount: applied.appliedCount,
          skippedCount: applied.skippedCount,
          previewJobId,
          message: replaceInPlace
            ? applied.skippedCount > 0
              ? `Макет сохранён в текущую версию: ${applied.appliedCount} из ${layoutObjects.length} объектов`
              : `Макет сохранён в текущую версию: ${applied.appliedCount} изображений встроено в PDF`
            : applied.skippedCount > 0
              ? `Макет сохранён: ${applied.appliedCount} из ${layoutObjects.length} объектов (часть вне диапазона страниц)`
              : `Макет сохранён: ${applied.appliedCount} изображений встроено в PDF`,
          replaceInPlace,
        },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Apply layout PDF failed';
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
        payload: { documentId, sourceVersionId, objectCount: layoutObjects.length },
      });
    } catch {
      // Preserve the original error if the failure marker cannot be written.
    }
    throw err;
  }
}
