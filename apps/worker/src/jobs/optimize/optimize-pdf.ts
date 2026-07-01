import type { OptimizePreset } from '@folio-mind/pdf-contracts';
import type { WorkerJobPayload } from '../../lib/config/job-types.js';
import type { WorkerEnv } from '../../lib/config/env.js';
import { getPrisma } from '../../lib/infra/prisma.js';
import {
  failOptimizeOperation,
  finalizeOptimizeVersion,
} from '../../lib/pdf/finalize-optimize-version.js';
import { optimizePdfBuffer } from '../../lib/pdf/optimize-pdf.js';
import {
  deleteObjectByKey,
  getObjectBuffer,
  isWorkerS3Configured,
  putObjectBuffer,
} from '../../lib/storage/s3.js';

type OptimizePdfPayload = WorkerJobPayload & {
  operationJobId?: string;
  documentId?: string;
  sourceVersionId?: string;
  targetVersionId?: string;
  sourceS3Key?: string;
  targetS3Key?: string;
  preset?: OptimizePreset;
};

export async function processOptimizePdfJob(env: WorkerEnv, data: OptimizePdfPayload): Promise<void> {
  const {
    operationJobId,
    documentId,
    sourceVersionId,
    targetVersionId,
    sourceS3Key,
    targetS3Key,
    preset = 'email',
    requestId,
  } = data;

  if (
    !operationJobId ||
    !documentId ||
    !sourceVersionId ||
    !targetVersionId ||
    !sourceS3Key ||
    !targetS3Key
  ) {
    throw new Error('Optimize PDF job: missing required payload fields');
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

    const sourceBuffer = await getObjectBuffer(sourceS3Key);
    const optimized = await optimizePdfBuffer(sourceBuffer, preset);

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
      body: optimized.buffer,
      contentType: 'application/pdf',
    });

    const previewJobId = await finalizeOptimizeVersion({
      env,
      data,
      documentId,
      targetVersionId,
      targetS3Key,
      outputBuffer: optimized.buffer,
      pageCount: optimized.pageCount,
      operation: 'optimize-pdf',
      operationMeta: {
        sourceVersionId,
        preset,
        method: optimized.method,
        engineDetail: optimized.engineDetail,
        toolsAvailable: optimized.toolsAvailable,
        sourceBytes: optimized.sourceBytes,
        outputBytes: optimized.outputBytes,
      },
      requestId,
    });

    const savedPct =
      optimized.sourceBytes > 0
        ? Math.round((1 - optimized.outputBytes / optimized.sourceBytes) * 100)
        : 0;

    const noExternalTools =
      !optimized.toolsAvailable.qpdf && !optimized.toolsAvailable.ghostscript;
    const noCompression = optimized.method === 'copy' && savedPct <= 0;

    await prisma.job.update({
      where: { id: operationJobId },
      data: {
        status: 'completed',
        payload: {
          documentId,
          sourceVersionId,
          targetVersionId,
          preset,
          method: optimized.method,
          engineDetail: optimized.engineDetail,
          toolsAvailable: optimized.toolsAvailable,
          sourceBytes: optimized.sourceBytes,
          outputBytes: optimized.outputBytes,
          savedPercent: savedPct,
          previewJobId,
          message: noCompression && noExternalTools
            ? 'Размер не изменился — установите qpdf и Ghostscript на машине worker (см. README)'
            : noCompression
              ? 'Файл уже оптимален — заметного сжатия без потери качества нет'
              : savedPct > 0
                ? `Размер уменьшен примерно на ${savedPct}% (${optimized.method})`
                : 'Новая версия собрана без уменьшения размера',
        },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Optimize PDF failed';
    try {
      await deleteObjectByKey(targetS3Key);
    } catch {}
    try {
      await failOptimizeOperation({
        operationJobId,
        targetVersionId,
        error: message,
        payload: { documentId, sourceVersionId, preset },
      });
    } catch {}
    throw err;
  }
}
