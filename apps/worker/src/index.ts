import { initTracing, withSpan } from '@folio-mind/observability';
import { Worker } from 'bullmq';
import { processAiChatJob } from './jobs/ai/ai-chat.js';
import { processAiSummaryJob } from './jobs/ai/ai-summary.js';
import { processMergeVersionsJob } from './jobs/optimize/merge-versions.js';
import { processSplitPagesJob } from './jobs/optimize/split-pages.js';
import {
  processGeneratePreviewsJob,
  processPreviewPagesJob,
} from './jobs/preview/generate-previews.js';
import { loadWorkerEnv } from './lib/config/env.js';
import { loadAppEnv } from './lib/config/load-env.js';
import type { WorkerJobPayload } from './lib/config/job-types.js';
import { initWorkerS3, isWorkerS3Configured } from './lib/storage/s3.js';
import { createRedisConnection, QUEUE_NAMES } from './queue/queues.js';

loadAppEnv();
initTracing('folio-mind-worker');

const env = loadWorkerEnv();
initWorkerS3(env);

if (!isWorkerS3Configured()) {
  console.warn(
    '[worker] S3 не настроен — превью не будут создаваться. Проверьте apps/server/.env (S3_*) и перезапустите worker.',
  );
}

const connection = createRedisConnection(env.REDIS_URL);

function logJob(queue: string, jobId: string | undefined, data: WorkerJobPayload) {
  const requestId = data.requestId ?? '—';
  console.log(`[${queue}] job=${jobId ?? '?'} request_id=${requestId}`, data);
}

function createPreviewWorker() {
  return new Worker(
    QUEUE_NAMES.preview,
    async (job) => {
      const data = job.data as WorkerJobPayload;
      return withSpan(
        'folio-mind-worker',
        'preview',
        {
          'folio.request_id': data.requestId ?? String(job.id),
          'job.id': String(job.id),
        },
        async () => {
          logJob('preview', job.id, data);
          if (job.name === 'generate-previews') {
            await processGeneratePreviewsJob(env, data);
          } else if (job.name === 'preview-pages') {
            await processPreviewPagesJob(env, data);
          }
          return { ok: true };
        },
      );
    },
    { connection, concurrency: env.PREVIEW_WORKER_CONCURRENCY },
  );
}

function createAiWorker() {
  return new Worker(
    QUEUE_NAMES.ai,
    async (job) => {
      const data = job.data as WorkerJobPayload;
      return withSpan(
        'folio-mind-worker',
        'ai',
        {
          'folio.request_id': data.requestId ?? String(job.id),
          'job.id': String(job.id),
        },
        async () => {
          logJob('ai', job.id, data);
          if (job.name === 'summary') {
            await processAiSummaryJob(env, data);
          } else if (job.name === 'chat') {
            await processAiChatJob(env, data);
          }
          return { ok: true };
        },
      );
    },
    { connection, concurrency: env.AI_WORKER_CONCURRENCY },
  );
}

function createOptimizeWorker() {
  return new Worker(
    QUEUE_NAMES.optimize,
    async (job) => {
      const data = job.data as WorkerJobPayload;
      return withSpan(
        'folio-mind-worker',
        'optimize',
        {
          'folio.request_id': data.requestId ?? String(job.id),
          'job.id': String(job.id),
        },
        async () => {
          logJob('optimize', job.id, data);
          if (job.name === 'split-pages') {
            await processSplitPagesJob(env, data);
          } else if (job.name === 'merge-versions') {
            await processMergeVersionsJob(env, data);
          }
          return { ok: true };
        },
      );
    },
    { connection, concurrency: env.OPTIMIZE_WORKER_CONCURRENCY },
  );
}

const previewWorker = createPreviewWorker();
const aiWorker = createAiWorker();
const optimizeWorker = createOptimizeWorker();

previewWorker.on('failed', (job, err) => console.error('[preview] failed', job?.id, err));
aiWorker.on('failed', (job, err) => console.error('[ai] failed', job?.id, err));
optimizeWorker.on('failed', (job, err) => console.error('[optimize] failed', job?.id, err));

console.log(
  `Worker started: queues preview (concurrency=${env.PREVIEW_WORKER_CONCURRENCY}), ai (concurrency=${env.AI_WORKER_CONCURRENCY}), optimize (concurrency=${env.OPTIMIZE_WORKER_CONCURRENCY})`,
);

async function shutdown() {
  await Promise.all([previewWorker.close(), aiWorker.close(), optimizeWorker.close()]);
  await connection.quit();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
