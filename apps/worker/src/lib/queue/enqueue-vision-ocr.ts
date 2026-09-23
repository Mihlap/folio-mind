import { Queue } from 'bullmq';
import type { AIProviderName } from '@folio-mind/ai-providers';
import type { WorkerEnv } from '../config/env.js';
import { getPrisma } from '../infra/prisma.js';
import { createRedisConnection, QUEUE_NAMES } from '../../queue/queues.js';

let previewQueue: Queue | null = null;

function getPreviewQueue(redisUrl: string): Queue {
  if (!previewQueue) {
    previewQueue = new Queue(QUEUE_NAMES.preview, {
      connection: createRedisConnection(redisUrl),
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 2,
        backoff: { type: 'exponential', delay: 3000 },
      },
    });
  }
  return previewQueue;
}

export async function enqueueVisionOcrJob(params: {
  env: WorkerEnv;
  documentId: string;
  versionId: string;
  tenantId: string;
  s3Key: string;
  pageCount: number;
  provider?: AIProviderName;
  requestId?: string;
}): Promise<string> {
  const { env, documentId, versionId, tenantId, s3Key, pageCount, provider, requestId } = params;
  const prisma = getPrisma();
  const job = await prisma.job.create({
    data: {
      type: 'vision-ocr',
      status: 'queued',
      tenantId,
      payload: {
        documentId,
        versionId,
        s3Key,
        pageCount,
        provider: provider ?? env.AI_PROVIDER,
      },
    },
  });
  await getPreviewQueue(env.REDIS_URL).add(
    'vision-ocr',
    {
      jobId: job.id,
      documentId,
      versionId,
      tenantId,
      s3Key,
      pageCount,
      provider: provider ?? env.AI_PROVIDER,
      requestId,
    },
    { jobId: job.id },
  );
  return job.id;
}
