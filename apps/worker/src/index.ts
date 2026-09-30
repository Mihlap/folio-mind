import { initTracing, withSpan } from '@folio-mind/observability';
import { Worker } from 'bullmq';
import { processAiChatJob } from './jobs/ai/ai-chat.js';
import { processAiSuggestionsJob } from './jobs/ai/ai-suggestions.js';
import { processRagCompareJob } from './jobs/ai/rag-compare.js';
import { processAiSummaryJob } from './jobs/ai/ai-summary.js';
import { processBookletTitleDraftJob } from './jobs/ai/booklet-title.js';
import { processPresentationAiJob } from './jobs/ai/presentation-ai.js';
import { processApplyLayoutPdfJob } from './jobs/optimize/apply-layout-pdf.js';
import { processApplyAcceptedSuggestionsJob } from './jobs/optimize/apply-accepted-suggestions.js';
import { processApplyEditsFinalJob } from './jobs/optimize/apply-edits-final.js';
import { processExportHighlightDocxJob } from './jobs/optimize/export-highlight-docx.js';
import { processExportFormDataJob } from './jobs/optimize/export-form-data.js';
import { processApplyVisualSignatureJob } from './jobs/optimize/apply-visual-signature.js';
import { processExportBookletJob } from './jobs/optimize/export-booklet-package.js';
import { processExportPagesJob } from './jobs/optimize/export-pages-images.js';
import { processExportPresentationPdfJob } from './jobs/optimize/export-presentation-pdf.js';
import { processPrintReadinessJob } from './jobs/optimize/print-readiness.js';
import { processMergeVersionsJob } from './jobs/optimize/merge-versions.js';
import { processPreConvertPdfJob } from './jobs/optimize/pre-convert-pdf.js';
import { processConvertVersionDocxJob } from './jobs/optimize/convert-version-docx.js';
import { processImportFromDocxJob } from './jobs/optimize/import-from-docx.js';
import { processOptimizePdfJob } from './jobs/optimize/optimize-pdf.js';
import { processMediaOptimizeJob } from './jobs/media/media-optimize.js';
import { processSplitPagesJob } from './jobs/optimize/split-pages.js';
import {
  processGeneratePreviewsJob,
  processPreviewPagesJob,
} from './jobs/preview/generate-previews.js';
import { processVisionOcrJob } from './jobs/preview/vision-ocr.js';
import { processDocumentExtractJob } from './jobs/ai/document-extract.js';
import { processRagIndexJob } from './jobs/rag/rag-index.js';
import { processDocumentIndexJob } from './jobs/rag/document-index.js';
import { loadWorkerEnv } from './lib/config/env.js';
import { loadAppEnv } from './lib/config/load-env.js';
import type { WorkerJobPayload } from './lib/config/job-types.js';
import { initWorkerS3, isWorkerS3Configured } from './lib/storage/s3.js';
import { createRedisConnection, QUEUE_NAMES } from './queue/queues.js';
import { getOptimizeToolAvailability } from './lib/pdf/optimize-external.js';
loadAppEnv();
initTracing('folio-mind-worker');
const env = loadWorkerEnv();
initWorkerS3(env);
if (!isWorkerS3Configured()) {
  console.warn(
    '[worker] S3 не настроен — превью не будут создаваться. Проверьте apps/server/.env (S3_*) и перезапустите worker.',
  );
}
void getOptimizeToolAvailability().then((tools) => {
  if (!tools.qpdf && !tools.ghostscript) {
    console.warn(
      '[worker] qpdf и Ghostscript не найдены — сжатие PDF и PDF/A недоступны. Windows: winget install QPDF.QPDF; Ghostscript: powershell -File .\\tools\\install-ghostscript.ps1',
    );
    return;
  }
  console.log(
    `[worker] PDF optimize tools: qpdf=${tools.qpdf ? 'ok' : 'нет'}, ghostscript=${tools.ghostscript ? 'ok' : 'нет'}`,
  );
});
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
          } else if (job.name === 'vision-ocr') {
            await processVisionOcrJob(env, data);
          } else if (job.name === 'rag-index') {
            await processRagIndexJob(env, data);
          } else if (job.name === 'document-index') {
            await processDocumentIndexJob(env, data);
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
          } else if (job.name === 'suggestions') {
            await processAiSuggestionsJob(env, data);
          } else if (job.name === 'rag-compare') {
            await processRagCompareJob(env, data);
          } else if (job.name === 'document-extract') {
            await processDocumentExtractJob(env, data);
          } else if (job.name === 'booklet-title') {
            await processBookletTitleDraftJob(env, data);
          } else if (job.name === 'presentation-ai') {
            await processPresentationAiJob(env, data);
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
          if (job.name === 'pre-convert-pdf') {
            await processPreConvertPdfJob(env, data);
          } else if (job.name === 'convert-version-docx') {
            await processConvertVersionDocxJob(env, data);
          } else if (job.name === 'split-pages') {
            await processSplitPagesJob(env, data);
          } else if (job.name === 'merge-versions') {
            await processMergeVersionsJob(env, data);
          } else if (job.name === 'apply-accepted-suggestions') {
            await processApplyAcceptedSuggestionsJob(env, data);
          } else if (job.name === 'apply-edits-final') {
            await processApplyEditsFinalJob(env, data);
          } else if (job.name === 'export-highlight-docx') {
            await processExportHighlightDocxJob(env, data);
          } else if (job.name === 'export-form-data') {
            await processExportFormDataJob(env, data);
          } else if (job.name === 'apply-visual-signature') {
            await processApplyVisualSignatureJob(env, data);
          } else if (job.name === 'export-booklet') {
            await processExportBookletJob(env, data);
          } else if (job.name === 'export-pages') {
            await processExportPagesJob(env, data);
          } else if (job.name === 'export-presentation-pdf') {
            await processExportPresentationPdfJob(env, data);
          } else if (job.name === 'print-readiness') {
            await processPrintReadinessJob(env, data);
          } else if (job.name === 'optimize-pdf') {
            await processOptimizePdfJob(env, data);
          } else if (job.name === 'apply-layout-pdf') {
            await processApplyLayoutPdfJob(env, data);
          } else if (job.name === 'import-from-docx') {
            await processImportFromDocxJob(env, data);
          } else if (job.name === 'media-optimize') {
            await processMediaOptimizeJob(env, data);
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
