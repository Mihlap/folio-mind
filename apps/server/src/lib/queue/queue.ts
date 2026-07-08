import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import type { Env } from '../config/env.js';
const QUEUE_NAMES = {
  preview: 'preview',
  ai: 'ai',
  optimize: 'optimize',
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
let optimizeQueue: Queue | null = null;
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
  if (!optimizeQueue) {
    optimizeQueue = new Queue(QUEUE_NAMES.optimize, {
      connection: conn,
      defaultJobOptions: {
        removeOnComplete: 200,
        removeOnFail: 100,
        attempts: 2,
        backoff: { type: 'exponential', delay: 3000 },
      },
    });
  }
  return { previewQueue, aiQueue, optimizeQueue };
}
async function readCounts(queue: Queue): Promise<QueueCounts> {
  const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed');
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
  const dedupeId = `preview-pages-${payload.versionId}-${payload.fromPage}-${payload.toPage}`;
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
    type: 'summary' | 'chat' | 'suggestions' | 'rag-compare' | 'booklet-title';
    prompt?: string;
    requestId?: string;
  },
): Promise<void> {
  const { aiQueue } = getQueues(env);
  await aiQueue.add(payload.type, payload, { jobId: payload.jobId });
}
export async function enqueueRagIndexJob(
  env: Env,
  payload: {
    jobId: string;
    sourceId: string;
    tenantId: string;
    s3Key: string;
    fileName: string;
    requestId?: string;
  },
): Promise<void> {
  const { previewQueue } = getQueues(env);
  await previewQueue.add('rag-index', payload, { jobId: payload.jobId });
}
export async function enqueueSplitPagesJob(
  env: Env,
  payload: {
    jobId: string;
    operationJobId: string;
    documentId: string;
    sourceVersionId: string;
    targetVersionId: string;
    tenantId: string;
    sourceS3Key: string;
    targetS3Key: string;
    pages: number[];
    requestId?: string;
  },
): Promise<void> {
  const { optimizeQueue } = getQueues(env);
  await optimizeQueue.add('split-pages', payload, { jobId: payload.jobId });
}
export async function enqueueApplyAcceptedSuggestionsJob(
  env: Env,
  payload: {
    jobId: string;
    operationJobId: string;
    documentId: string;
    sourceVersionId: string;
    targetVersionId: string;
    tenantId: string;
    sourceS3Key: string;
    targetS3Key: string;
    requestId?: string;
  },
): Promise<void> {
  const { optimizeQueue } = getQueues(env);
  await optimizeQueue.add('apply-accepted-suggestions', payload, { jobId: payload.jobId });
}
export async function enqueueApplyEditsFinalJob(
  env: Env,
  payload: {
    jobId: string;
    operationJobId: string;
    documentId: string;
    editSourceVersionId: string;
    rootVersionId: string;
    sourceVersionId: string;
    targetVersionId: string;
    tenantId: string;
    sourceS3Key: string;
    editSourceS3Key?: string;
    targetS3Key: string;
    userSourceDocxKey: string | null;
    requestId?: string;
  },
): Promise<void> {
  const { optimizeQueue } = getQueues(env);
  await optimizeQueue.add('apply-edits-final', payload, { jobId: payload.jobId });
}
export async function enqueueExportHighlightDocxJob(
  env: Env,
  payload: {
    jobId: string;
    operationJobId: string;
    documentId: string;
    versionId: string;
    rootVersionId: string;
    tenantId: string;
    sourceS3Key: string;
    userSourceDocxKey: string | null;
    requestId?: string;
  },
): Promise<void> {
  const { optimizeQueue } = getQueues(env);
  await optimizeQueue.add('export-highlight-docx', payload, { jobId: payload.jobId });
}

export async function enqueueExportFormDataJob(
  env: Env,
  payload: {
    jobId: string;
    operationJobId: string;
    documentId: string;
    versionId: string;
    tenantId: string;
    sourceS3Key: string;
    format?: 'json' | 'csv';
    requestId?: string;
  },
): Promise<void> {
  const { optimizeQueue } = getQueues(env);
  await optimizeQueue.add('export-form-data', payload, { jobId: payload.jobId });
}

export async function enqueueApplyVisualSignatureJob(
  env: Env,
  payload: {
    jobId: string;
    operationJobId: string;
    documentId: string;
    sourceVersionId: string;
    targetVersionId: string;
    tenantId: string;
    sourceS3Key: string;
    targetS3Key: string;
    imageS3Key: string;
    page: number;
    xNorm: number;
    yNorm: number;
    widthNorm: number;
    heightNorm: number;
    requestId?: string;
  },
): Promise<void> {
  const { optimizeQueue } = getQueues(env);
  await optimizeQueue.add('apply-visual-signature', payload, { jobId: payload.jobId });
}

export async function enqueueExportBookletJob(
  env: Env,
  payload: {
    jobId: string;
    operationJobId: string;
    documentId: string;
    versionId: string;
    tenantId: string;
    sourceS3Key: string;
    title: string;
    jpegDpi: number;
    pdfA: boolean;
    requestId?: string;
  },
): Promise<void> {
  const { optimizeQueue } = getQueues(env);
  await optimizeQueue.add('export-booklet', payload, { jobId: payload.jobId });
}

export async function enqueueExportPagesJob(
  env: Env,
  payload: {
    jobId: string;
    operationJobId: string;
    documentId: string;
    versionId: string;
    tenantId: string;
    sourceS3Key: string;
    pages: number[];
    format: 'jpeg' | 'png';
    dpi: number;
    requestId?: string;
  },
): Promise<void> {
  const { optimizeQueue } = getQueues(env);
  await optimizeQueue.add('export-pages', payload, { jobId: payload.jobId });
}

export async function enqueuePrintReadinessJob(
  env: Env,
  payload: {
    jobId: string;
    operationJobId: string;
    documentId: string;
    versionId: string;
    tenantId: string;
    sourceS3Key: string;
    requestId?: string;
  },
): Promise<void> {
  const { optimizeQueue } = getQueues(env);
  await optimizeQueue.add('print-readiness', payload, { jobId: payload.jobId });
}

export async function enqueueApplyLayoutPdfJob(
  env: Env,
  payload: {
    jobId: string;
    operationJobId: string;
    documentId: string;
    sourceVersionId: string;
    targetVersionId: string;
    tenantId: string;
    sourceS3Key: string;
    targetS3Key: string;
    layoutObjects: Array<{
      id: string;
      page: number;
      rect: { x: number; y: number; width: number; height: number };
      imageSrc: string;
      rotation: number;
    }>;
    requestId?: string;
  },
): Promise<void> {
  const { optimizeQueue } = getQueues(env);
  await optimizeQueue.add('apply-layout-pdf', payload, { jobId: payload.jobId });
}

export async function enqueueOptimizePdfJob(
  env: Env,
  payload: {
    jobId: string;
    operationJobId: string;
    documentId: string;
    sourceVersionId: string;
    targetVersionId: string;
    tenantId: string;
    sourceS3Key: string;
    targetS3Key: string;
    preset: string;
    requestId?: string;
  },
): Promise<void> {
  const { optimizeQueue } = getQueues(env);
  await optimizeQueue.add('optimize-pdf', payload, { jobId: payload.jobId });
}

export async function enqueuePreConvertJob(
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
  const { optimizeQueue } = getQueues(env);
  await optimizeQueue.add('pre-convert-pdf', payload, { jobId: payload.jobId });
}
export async function enqueueImportFromDocxJob(
  env: Env,
  payload: {
    jobId: string;
    operationJobId: string;
    documentId: string;
    versionId: string;
    tenantId: string;
    sourceDocxKey: string;
    targetS3Key: string;
    requestId?: string;
  },
): Promise<void> {
  const { optimizeQueue } = getQueues(env);
  await optimizeQueue.add('import-from-docx', payload, { jobId: payload.jobId });
}

export async function enqueueMediaOptimizeJob(
  env: Env,
  payload: {
    jobId: string;
    mediaAssetId: string;
    tenantId: string;
    s3Key: string;
    requestId?: string;
  },
): Promise<void> {
  const { optimizeQueue } = getQueues(env);
  await optimizeQueue.add('media-optimize', payload, { jobId: payload.jobId });
}
export async function enqueueMergeVersionsJob(
  env: Env,
  payload: {
    jobId: string;
    operationJobId: string;
    documentId: string;
    targetVersionId: string;
    tenantId: string;
    sourceS3Keys: string[];
    sourceVersionIds: string[];
    targetS3Key: string;
    requestId?: string;
  },
): Promise<void> {
  const { optimizeQueue } = getQueues(env);
  await optimizeQueue.add('merge-versions', payload, { jobId: payload.jobId });
}
