import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import type { Env } from '../config/env.js';

const QUEUE_NAMES = {
  preview: 'preview',
  ai: 'ai',
} as const;

export type QueueCounts = {
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  completed: number;
};

let connection: IORedis | null = null;
let previewQueue: Queue | null = null;
let aiQueue: Queue | null = null;

function getConnection(redisUrl: string): IORedis {
  if (!connection) {
    connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  }
  return connection;
}

function getQueues(env: Env) {
  const conn = getConnection(env.REDIS_URL);
  if (!previewQueue) {
    previewQueue = new Queue(QUEUE_NAMES.preview, {
      connection: conn,
      defaultJobOptions: {
        removeOnComplete: 200,
        removeOnFail: 100,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      },
    });
  }
  if (!aiQueue) {
    aiQueue = new Queue(QUEUE_NAMES.ai, {
      connection: conn,
      defaultJobOptions: {
        removeOnComplete: 200,
        removeOnFail: 100,
        attempts: 2,
        backoff: { type: 'exponential', delay: 3000 },
      },
    });
  }
  return { previewQueue, aiQueue };
}

async function readCounts(queue: Queue): Promise<QueueCounts> {
  const counts = await queue.getJobCounts(
    'waiting',
    'active',
    'delayed',
    'failed',
    'completed',
  );
  return {
    waiting: counts.waiting ?? 0,
    active: counts.active ?? 0,
    delayed: counts.delayed ?? 0,
    failed: counts.failed ?? 0,
    completed: counts.completed ?? 0,
  };
}

export async function getQueueMetrics(env: Env): Promise<{
  preview: QueueCounts;
  ai: QueueCounts;
}> {
  const { previewQueue, aiQueue } = getQueues(env);
  const [preview, ai] = await Promise.all([readCounts(previewQueue), readCounts(aiQueue)]);
  return { preview, ai };
}

export async function enqueuePreviewJob(
  env: Env,
  payload: {
    jobId: string;
    documentId: string;
    versionId: string;
    tenantId: string;
    s3Key: string;
    requestId?: string;
  },
): Promise<void> {
  const { previewQueue } = getQueues(env);
  await previewQueue.add('generate-previews', payload, { jobId: payload.jobId });
}

export async function enqueuePreviewPagesJob(
  env: Env,
  payload: {
    jobId: string;
    documentId: string;
    versionId: string;
    tenantId: string;
    s3Key: string;
    fromPage: number;
    toPage: number;
    requestId?: string;
  },
): Promise<boolean> {
  const { previewQueue } = getQueues(env);
  const dedupeId = `preview-pages:${payload.versionId}:${payload.fromPage}-${payload.toPage}`;
  const existing = await previewQueue.getJob(dedupeId);
  if (existing) {
    const state = await existing.getState();
    if (state === 'waiting' || state === 'active' || state === 'delayed') {
      return false;
    }
  }

  await previewQueue.add('preview-pages', payload, {
    jobId: dedupeId,
  });
  return true;
}

export async function enqueueAiJob(
  env: Env,
  payload: {
    jobId: string;
    documentId: string;
    versionId: string;
    tenantId: string;
    type: 'summary' | 'chat';
    prompt?: string;
    requestId?: string;
  },
): Promise<void> {
  const { aiQueue } = getQueues(env);
  await aiQueue.add(payload.type, payload, { jobId: payload.jobId });
}
