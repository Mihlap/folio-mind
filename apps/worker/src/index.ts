import { initTracing, withSpan } from '@folio-mind/observability';
import { Worker } from 'bullmq';
import { loadAppEnv } from './lib/load-env.js';
import type { WorkerJobPayload } from './lib/job-types.js';
import { createRedisConnection, QUEUE_NAMES } from './queues.js';

loadAppEnv();
initTracing('folio-mind-worker');

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const connection = createRedisConnection(redisUrl);

function logJob(queue: string, jobId: string | undefined, data: WorkerJobPayload) {
  const requestId = data.requestId ?? '—';
  console.log(`[${queue}] job=${jobId ?? '?'} request_id=${requestId}`, data);
}

function createPreviewWorker() {
  return new Worker(
    QUEUE_NAMES.preview,
    async (job) => {
      const data = job.data as WorkerJobPayload;
      return withSpan('folio-mind-worker', 'preview', {
        'folio.request_id': data.requestId ?? String(job.id),
        'job.id': String(job.id),
      }, async () => {
        logJob('preview', job.id, data);
        return { ok: true };
      });
    },
    { connection, concurrency: 2 },
  );
}

function createAiWorker() {
  return new Worker(
    QUEUE_NAMES.ai,
    async (job) => {
      const data = job.data as WorkerJobPayload;
      return withSpan('folio-mind-worker', 'ai', {
        'folio.request_id': data.requestId ?? String(job.id),
        'job.id': String(job.id),
      }, async () => {
        logJob('ai', job.id, data);
        return { ok: true };
      });
    },
    { connection, concurrency: 1 },
  );
}

const previewWorker = createPreviewWorker();
const aiWorker = createAiWorker();

previewWorker.on('failed', (job, err) => console.error('[preview] failed', job?.id, err));
aiWorker.on('failed', (job, err) => console.error('[ai] failed', job?.id, err));

console.log('Worker started: queues preview, ai');

async function shutdown() {
  await Promise.all([previewWorker.close(), aiWorker.close()]);
  await connection.quit();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
