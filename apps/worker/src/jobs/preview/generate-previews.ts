import { extractedTextKey, previewPageKey } from '@folio-mind/pdf-contracts';
import type { WorkerJobPayload } from '../../lib/config/job-types.js';
import type { WorkerEnv } from '../../lib/config/env.js';
import { extractTextFromPdf } from '../../lib/pdf/pdf-text.js';
import { analyzePdfIntegrityFromBuffer } from '../../lib/pdf/pdf-integrity.js';
import {
  getPreviewLimits,
  renderPdfPageRange,
  renderPdfPreviews,
} from '../../lib/pdf/pdf-previews.js';
import { getPrisma } from '../../lib/infra/prisma.js';
import {
  getObjectBuffer,
  isWorkerS3Configured,
  objectExists,
  putObjectBuffer,
} from '../../lib/storage/s3.js';

type PreviewJobPayload = WorkerJobPayload & {
  jobId?: string;
  documentId?: string;
  versionId?: string;
  s3Key?: string;
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
    const { jobId, documentId, versionId, s3Key } = data;

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
    const integrity = await analyzePdfIntegrityFromBuffer(pdfBuffer);
    const { pageCount, previews, initialPages } = await renderPdfPreviews(pdfBuffer);

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

    for (const preview of previews) {
      await putObjectBuffer({
        key: previewPageKey(documentId, versionId, preview.page),
        body: preview.png,
        contentType: 'image/png',
      });
    }

    try {
      await prisma.documentVersion.update({
        where: { id: versionId },
        data: {
          status: 'ready',
          pageCount,
          integrityStatus: integrity.verdict,
          integrityScore: integrity.score,
          integritySummary: integrity.summary,
          integrityDetails: integrity,
          integrityAnalyzedAt: new Date(),
        },
      });
    } catch (integrityErr) {
      console.warn('[preview] integrity metadata save failed, version marked ready', integrityErr);
      await prisma.documentVersion.update({
        where: { id: versionId },
        data: { status: 'ready', pageCount },
      });
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
        const extracted = await withTimeout(extractTextFromPdf(pdfBuffer), 20_000, 'Extract text');
        await putObjectBuffer({
          key: textKey,
          body: Buffer.from(
            JSON.stringify({
              text: extracted.text,
              pages: extracted.pages,
              extractedAt: new Date().toISOString(),
            }),
            'utf8',
          ),
          contentType: 'application/json',
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
            },
          },
        });
      } catch (err) {
        const textError = err instanceof Error ? err.message : 'Text extraction failed';
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
      await prisma.documentVersion.update({
        where: { id: versionId },
        data: { status: 'failed' },
      });
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
      const key = previewPageKey(documentId, versionId, preview.page);
      const exists = await objectExists(key);
      if (exists) continue;
      await putObjectBuffer({
        key,
        body: preview.png,
        contentType: 'image/png',
      });
      uploaded += 1;
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