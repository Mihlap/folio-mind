import {
  buildExtractedTextPayload,
  extractedTextKey,
  needsVisionOcr,
  parseExtractedTextJson,
  previewPageThumbKey,
  previewPageViewKey,
} from '@folio-mind/pdf-contracts';
import type { WorkerJobPayload } from '../../lib/config/job-types.js';
import type { WorkerEnv } from '../../lib/config/env.js';
import { extractTextFromPdf } from '../../lib/pdf/pdf-text.js';
import { analyzePdfIntegrityFromBuffer } from '../../lib/pdf/pdf-integrity.js';
import {
  countPdfPages,
  getPreviewLimits,
  renderPdfPageRange,
  renderPdfPreviews,
} from '../../lib/pdf/pdf-previews.js';
import { getPrisma } from '../../lib/infra/prisma.js';
import { enqueueVisionOcrJob } from '../../lib/queue/enqueue-vision-ocr.js';
import {
  getObjectBuffer,
  isWorkerS3Configured,
  objectExists,
  putObjectBuffer,
} from '../../lib/storage/s3.js';
import { indexDocumentVersionChunks } from '../rag/document-index.js';
type PreviewJobPayload = WorkerJobPayload & {
  jobId?: string;
  documentId?: string;
  versionId?: string;
  tenantId?: string;
  s3Key?: string;
  forceOcr?: boolean;
};
type PreviewPagesJobPayload = PreviewJobPayload & {
  fromPage?: number;
  toPage?: number;
};
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
    promise
      .then((v) => {
        clearTimeout(timer);
        resolve(v);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}
function previewJobTimeoutMs(env: WorkerEnv): number {
  return env.PREVIEW_JOB_TIMEOUT_MS;
}
export async function processGeneratePreviewsJob(
  env: WorkerEnv,
  data: PreviewJobPayload,
): Promise<void> {
  const run = async () => {
    const prisma = getPrisma();
    const { jobId, documentId, versionId, tenantId, s3Key } = data;
    if (!jobId || !documentId || !versionId || !s3Key) {
      throw new Error('Preview job: missing jobId, documentId, versionId or s3Key');
    }
    await prisma.job.update({
      where: { id: jobId },
      data: { status: 'processing' },
    });
    const versionExists = await prisma.documentVersion.findUnique({
      where: { id: versionId },
      select: { id: true },
    });
    if (!versionExists) {
      await prisma.job.update({
        where: { id: jobId },
        data: { status: 'completed', payload: { skipped: 'version_deleted' } },
      });
      return;
    }
    if (!isWorkerS3Configured()) {
      throw new Error('S3 не настроен в worker');
    }
    const pdfBuffer = await getObjectBuffer(s3Key);
    const pageCount = await countPdfPages(pdfBuffer);
    await prisma.documentVersion.update({
      where: { id: versionId },
      data: { status: 'ready', pageCount },
    });
    const integrity = await analyzePdfIntegrityFromBuffer(pdfBuffer);
    const versionExistsBeforeUpload = await prisma.documentVersion.findUnique({
      where: { id: versionId },
      select: { id: true },
    });
    if (!versionExistsBeforeUpload) {
      await prisma.job.update({
        where: { id: jobId },
        data: { status: 'completed', payload: { skipped: 'version_deleted' } },
      });
      return;
    }
    const { previews, initialPages } = await renderPdfPreviews(pdfBuffer, async (preview) => {
      await putObjectBuffer({
        key: previewPageThumbKey(documentId, versionId, preview.page),
        body: preview.thumb,
        contentType: 'image/png',
      });
      await putObjectBuffer({
        key: previewPageViewKey(documentId, versionId, preview.page),
        body: preview.view,
        contentType: 'image/png',
      });
    });
    try {
      await prisma.documentVersion.update({
        where: { id: versionId },
        data: {
          pageCount,
          integrityStatus: integrity.verdict,
          integrityScore: integrity.score,
          integritySummary: integrity.summary,
          integrityDetails: integrity,
          integrityAnalyzedAt: new Date(),
        },
      });
    } catch (integrityErr) {
      console.warn('[preview] integrity metadata save failed', integrityErr);
    }
    const textKey = extractedTextKey(documentId, versionId);
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'completed',
        payload: {
          documentId,
          versionId,
          s3Key,
          pageCount,
          previewPages: previews.length,
          initialPages,
          textKey: null,
          textExtracted: false,
          textError: null,
          integrityStatus: integrity.verdict,
          integrityScore: integrity.score,
        },
      },
    });
    void (async () => {
      try {
        const extracted = await withTimeout(extractTextFromPdf(pdfBuffer), 20000, 'Extract text');
        const textPayload = buildExtractedTextPayload({
          text: extracted.text,
          pages: extracted.pages,
          source: 'pdfjs',
        });
        await putObjectBuffer({
          key: textKey,
          body: Buffer.from(JSON.stringify(textPayload), 'utf8'),
          contentType: 'application/json',
        });

        let resolvedTenantId = tenantId;
        if (!resolvedTenantId) {
          const doc = await prisma.document.findUnique({
            where: { id: documentId },
            select: { tenantId: true },
          });
          resolvedTenantId = doc?.tenantId;
        }

        const pages =
          extracted.pages?.length > 0
            ? extracted.pages
            : parseExtractedTextJson(JSON.stringify(textPayload)).pages;
        const forceOcr = data.forceOcr === true;
        const scanLikely =
          forceOcr ||
          needsVisionOcr({
            text: extracted.text,
            pages,
            pageCount,
          });

        let visionOcrStatus: string = 'not_needed';
        let visionOcrJobId: string | null = null;
        if (scanLikely && resolvedTenantId) {
          if (env.AI_PROVIDER === 'gigachat') {
            visionOcrStatus = 'queued';
            await prisma.documentVersion.update({
              where: { id: versionId },
              data: { textSource: 'pdfjs', visionOcrStatus: 'queued' },
            });
            try {
              visionOcrJobId = await enqueueVisionOcrJob({
                env,
                documentId,
                versionId,
                tenantId: resolvedTenantId,
                s3Key,
                pageCount,
                provider: env.AI_PROVIDER,
                force: forceOcr,
              });
            } catch (ocrEnqueueErr) {
              console.warn('[preview] vision-ocr enqueue failed', ocrEnqueueErr);
              visionOcrStatus = 'failed';
              await prisma.documentVersion.update({
                where: { id: versionId },
                data: { visionOcrStatus: 'failed' },
              });
            }
          } else {
            visionOcrStatus = 'skipped';
            await prisma.documentVersion.update({
              where: { id: versionId },
              data: { textSource: 'pdfjs', visionOcrStatus: 'skipped' },
            });
          }
        } else {
          await prisma.documentVersion.update({
            where: { id: versionId },
            data: { textSource: 'pdfjs', visionOcrStatus: 'not_needed' },
          });
        }

        await prisma.job.update({
          where: { id: jobId },
          data: {
            payload: {
              documentId,
              versionId,
              s3Key,
              pageCount,
              previewPages: previews.length,
              initialPages,
              textKey,
              textExtracted: true,
              textError: null,
              textSource: 'pdfjs',
              visionOcrStatus,
              visionOcrJobId,
            },
          },
        });

        if (resolvedTenantId) {
          try {
            const indexResult = await indexDocumentVersionChunks({
              env,
              documentId,
              versionId,
              tenantId: resolvedTenantId,
            });
            await prisma.job.update({
              where: { id: jobId },
              data: {
                payload: {
                  documentId,
                  versionId,
                  s3Key,
                  pageCount,
                  previewPages: previews.length,
                  initialPages,
                  textKey,
                  textExtracted: true,
                  textError: null,
                  textSource: 'pdfjs',
                  visionOcrStatus,
                  visionOcrJobId,
                  documentIndexed: true,
                  documentChunkCount: indexResult.chunkCount,
                },
              },
            });
          } catch (indexErr) {
            console.warn('[preview] document-index after extract failed', indexErr);
          }
        }
      } catch (err) {
        const textError = err instanceof Error ? err.message : 'Text extraction failed';

        let resolvedTenantId = tenantId;
        if (!resolvedTenantId) {
          const doc = await prisma.document.findUnique({
            where: { id: documentId },
            select: { tenantId: true },
          });
          resolvedTenantId = doc?.tenantId;
        }
        let visionOcrStatus: string | null = null;
        let visionOcrJobId: string | null = null;
        if (resolvedTenantId && env.AI_PROVIDER === 'gigachat' && pageCount > 0) {
          try {
            visionOcrStatus = 'queued';
            await prisma.documentVersion.update({
              where: { id: versionId },
              data: { visionOcrStatus: 'queued' },
            });
            visionOcrJobId = await enqueueVisionOcrJob({
              env,
              documentId,
              versionId,
              tenantId: resolvedTenantId,
              s3Key,
              pageCount,
              provider: env.AI_PROVIDER,
            });
          } catch (ocrEnqueueErr) {
            console.warn('[preview] vision-ocr enqueue after extract failure', ocrEnqueueErr);
            visionOcrStatus = 'failed';
          }
        }
        await prisma.job.update({
          where: { id: jobId },
          data: {
            payload: {
              documentId,
              versionId,
              s3Key,
              pageCount,
              previewPages: previews.length,
              initialPages,
              textKey: null,
              textExtracted: false,
              textError,
              visionOcrStatus,
              visionOcrJobId,
            },
          },
        });
      }
    })();
  };
  try {
    await withTimeout(run(), previewJobTimeoutMs(env), 'Preview job');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Preview generation failed';
    const { jobId, documentId, versionId, s3Key } = data;
    if (jobId && versionId) {
      const prisma = getPrisma();
      const current = await prisma.documentVersion.findUnique({
        where: { id: versionId },
        select: { status: true },
      });
      if (!current || current.status !== 'ready') {
        await prisma.documentVersion.update({
          where: { id: versionId },
          data: { status: 'failed' },
        });
      }
      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: 'failed',
          payload: { documentId, versionId, s3Key, error: message },
        },
      });
    }
    throw err;
  }
}
export async function processPreviewPagesJob(
  env: WorkerEnv,
  data: PreviewPagesJobPayload,
): Promise<void> {
  const run = async () => {
    const prisma = getPrisma();
    const { jobId, documentId, versionId, s3Key, fromPage, toPage } = data;
    if (!jobId || !documentId || !versionId || !s3Key || !fromPage || !toPage) {
      throw new Error('Preview pages job: missing required fields');
    }
    const { maxPages } = getPreviewLimits();
    const cappedTo = Math.min(toPage, maxPages);
    if (fromPage > cappedTo) return;
    await prisma.job.update({
      where: { id: jobId },
      data: { status: 'processing' },
    });
    const versionExists = await prisma.documentVersion.findUnique({
      where: { id: versionId },
      select: { id: true },
    });
    if (!versionExists) {
      await prisma.job.update({
        where: { id: jobId },
        data: { status: 'completed', payload: { skipped: 'version_deleted' } },
      });
      return;
    }
    if (!isWorkerS3Configured()) {
      throw new Error('S3 не настроен в worker');
    }
    const pdfBuffer = await getObjectBuffer(s3Key);
    const previews = await renderPdfPageRange(pdfBuffer, fromPage, cappedTo);
    const versionExistsBeforeUpload = await prisma.documentVersion.findUnique({
      where: { id: versionId },
      select: { id: true },
    });
    if (!versionExistsBeforeUpload) {
      await prisma.job.update({
        where: { id: jobId },
        data: { status: 'completed', payload: { skipped: 'version_deleted' } },
      });
      return;
    }
    let uploaded = 0;
    for (const preview of previews) {
      const thumbKey = previewPageThumbKey(documentId, versionId, preview.page);
      const viewKey = previewPageViewKey(documentId, versionId, preview.page);
      const thumbExists = await objectExists(thumbKey);
      const viewExists = await objectExists(viewKey);
      if (thumbExists && viewExists) continue;
      if (!viewExists) {
        await putObjectBuffer({
          key: viewKey,
          body: preview.view,
          contentType: 'image/png',
        });
        uploaded += 1;
      }
      if (!thumbExists) {
        await putObjectBuffer({
          key: thumbKey,
          body: preview.thumb,
          contentType: 'image/png',
        });
        uploaded += 1;
      }
    }
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'completed',
        payload: {
          documentId,
          versionId,
          s3Key,
          fromPage,
          toPage: cappedTo,
          uploaded,
        },
      },
    });
  };
  try {
    await withTimeout(run(), previewJobTimeoutMs(env), 'Preview pages job');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Preview pages failed';
    const { jobId, documentId, versionId, s3Key, fromPage, toPage } = data;
    if (jobId) {
      const prisma = getPrisma();
      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: 'failed',
          payload: { documentId, versionId, s3Key, fromPage, toPage, error: message },
        },
      });
    }
    throw err;
  }
}
