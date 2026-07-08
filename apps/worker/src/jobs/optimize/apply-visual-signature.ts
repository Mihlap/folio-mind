import type { WorkerJobPayload } from '../../lib/config/job-types.js';
import type { WorkerEnv } from '../../lib/config/env.js';
import { applyVisualSignature } from '../../lib/pdf/visual-signature.js';
import { getPrisma } from '../../lib/infra/prisma.js';
import { deleteObjectByKey, getObjectBuffer, isWorkerS3Configured, putObjectBuffer } from '../../lib/storage/s3.js';
import {
  failOptimizeOperation,
  finalizeOptimizeVersion,
} from '../../lib/pdf/finalize-optimize-version.js';

type Payload = WorkerJobPayload & {
  operationJobId?: string;
  documentId?: string;
  sourceVersionId?: string;
  targetVersionId?: string;
  sourceS3Key?: string;
  targetS3Key?: string;
  imageS3Key?: string;
  page?: number;
  xNorm?: number;
  yNorm?: number;
  widthNorm?: number;
  heightNorm?: number;
  requestId?: string;
};

export async function processApplyVisualSignatureJob(env: WorkerEnv, data: Payload): Promise<void> {
  const {
    operationJobId,
    documentId,
    targetVersionId,
    sourceS3Key,
    targetS3Key,
    imageS3Key,
    page = 1,
    xNorm = 0.1,
    yNorm = 0.8,
    widthNorm = 0.25,
    heightNorm = 0.1,
    requestId,
  } = data;
  if (!operationJobId || !documentId || !targetVersionId || !sourceS3Key || !targetS3Key || !imageS3Key) {
    throw new Error('apply-visual-signature: missing fields');
  }
  const prisma = getPrisma();
  await prisma.job.update({ where: { id: operationJobId }, data: { status: 'processing' } });
  try {
    if (!isWorkerS3Configured()) throw new Error('S3 не настроен');
    const [pdfBuffer, imagePng] = await Promise.all([
      getObjectBuffer(sourceS3Key),
      getObjectBuffer(imageS3Key),
    ]);
    const output = await applyVisualSignature(pdfBuffer, imagePng, {
      page,
      xNorm,
      yNorm,
      widthNorm,
      heightNorm,
    });
    await putObjectBuffer({ key: targetS3Key, body: output, contentType: 'application/pdf' });
    const previewJobId = await finalizeOptimizeVersion({
      env,
      data,
      documentId,
      targetVersionId,
      targetS3Key,
      outputBuffer: output,
      pageCount: 0,
      operation: 'apply-visual-signature',
      operationMeta: { page, xNorm, yNorm },
      requestId,
    });
    await prisma.job.update({
      where: { id: operationJobId },
      data: {
        status: 'completed',
        payload: { documentId, targetVersionId, previewJobId, page },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'apply-visual-signature failed';
    try {
      await deleteObjectByKey(targetS3Key!);
    } catch {}
    await failOptimizeOperation({
      operationJobId,
      targetVersionId,
      error: message,
      payload: { documentId },
    });
    throw err;
  }
}
