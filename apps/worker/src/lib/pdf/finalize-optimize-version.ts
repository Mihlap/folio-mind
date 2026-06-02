import type { WorkerJobPayload } from '../config/job-types.js';
import type { WorkerEnv } from '../config/env.js';
import { getPrisma } from '../infra/prisma.js';
import { createQueues, createRedisConnection } from '../../queue/queues.js';

export async function finalizeOptimizeVersion(params: {
  env: WorkerEnv;
  data: WorkerJobPayload;
  documentId: string;
  targetVersionId: string;
  targetS3Key: string;
  outputBuffer: Buffer;
  pageCount: number;
  operation: string;
  operationMeta: Record<string, unknown>;
  requestId?: string;
}): Promise<string> {
  const { env, data, documentId, targetVersionId, targetS3Key, outputBuffer, pageCount, operation, operationMeta, requestId } =
    params;

  const prisma = getPrisma();
  // PDF уже в S3 — версию можно открывать в viewer; превью догоняют асинхронно.
  await prisma.documentVersion.update({
    where: { id: targetVersionId },
    data: {
      status: 'ready',
      size: BigInt(outputBuffer.length),
      pageCount,
    },
  });

  const previewJob = await prisma.job.create({
    data: {
      type: 'preview',
      status: 'queued',
      tenantId: data.tenantId ?? null,
      payload: {
        documentId,
        versionId: targetVersionId,
        s3Key: targetS3Key,
        operation,
        ...operationMeta,
      },
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
        versionId: targetVersionId,
        tenantId: data.tenantId,
        s3Key: targetS3Key,
        requestId,
      },
      { jobId: previewJob.id },
    );
  } finally {
    await connection.quit();
  }

  return previewJob.id;
}

export async function failOptimizeOperation(params: {
  operationJobId: string;
  targetVersionId: string;
  error: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  const prisma = getPrisma();
  await prisma.documentVersion.update({
    where: { id: params.targetVersionId },
    data: { status: 'failed' },
  });
  await prisma.job.update({
    where: { id: params.operationJobId },
    data: {
      status: 'failed',
      payload: { ...(params.payload ?? {}), error: params.error },
    },
  });
}
