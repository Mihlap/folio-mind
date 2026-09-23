import { previewPageKeyForVariant, type PreviewPageVariant } from '@folio-mind/pdf-contracts';
import type { PrismaClient } from '@prisma/client';
import type { Env } from '../config/env.js';
import { clampPreviewRange } from './preview-config.js';
import { enqueuePreviewPagesJob } from '../queue/queue.js';
import { getPresignedGetUrl, listPreviewPagesInRange } from '../storage/s3.js';

export type VersionPreviewStatus = 'processing' | 'ready' | 'partial' | 'unavailable';

export type VersionPreviewsResult = {
  pageCount: number;
  pages: Array<{ page: number; url: string }>;
  status: VersionPreviewStatus;
  pendingPages?: number[];
};

type VersionRow = {
  id: string;
  status: string;
  pageCount?: number | null;
  s3Key: string;
};

export async function fetchVersionPreviews(params: {
  env: Env;
  prisma: PrismaClient;
  documentId: string;
  versionId: string;
  version: VersionRow;
  tenantId: string;
  from?: number;
  to?: number;
  requestId?: string;
  enqueueMissing?: boolean;
  variant?: PreviewPageVariant;

  allowThumbFallback?: boolean;
}): Promise<VersionPreviewsResult> {
  const {
    env,
    prisma,
    documentId,
    versionId,
    version,
    tenantId,
    from,
    to,
    requestId,
    enqueueMissing = true,
    variant = 'thumb',
    allowThumbFallback = false,
  } = params;

  const isProcessing = version.status === 'processing';
  const pageCount = version.pageCount ?? 0;
  const scanLimit = pageCount > 0 ? pageCount : env.PREVIEW_MAX_PAGES;

  if (!isProcessing && pageCount === 0) {
    return { pageCount: 0, pages: [], status: 'unavailable' };
  }

  const { from: rangeFrom, to: rangeTo } = clampPreviewRange(env, scanLimit, from, to);
  const expiresInSeconds = 3600;
  const pages: Array<{ page: number; url: string }> = [];
  const missing: number[] = [];
  const needViewUpgrade: number[] = [];

  const viewPages =
    variant === 'view'
      ? await listPreviewPagesInRange(documentId, versionId, rangeFrom, rangeTo, 'view')
      : new Set<number>();
  const thumbPages =
    variant === 'view' && allowThumbFallback
      ? await listPreviewPagesInRange(documentId, versionId, rangeFrom, rangeTo, 'thumb')
      : new Set<number>();
  const existingPreviewPages =
    variant === 'view'
      ? viewPages
      : await listPreviewPagesInRange(documentId, versionId, rangeFrom, rangeTo, variant);

  for (let page = rangeFrom; page <= rangeTo; page++) {
    const hasView = viewPages.has(page);
    const hasThumb = thumbPages.has(page);
    const hasPrimary = existingPreviewPages.has(page);

    if (variant === 'view' && allowThumbFallback && hasThumb && !hasView) {
      const key = previewPageKeyForVariant(documentId, versionId, page, 'thumb');
      const url = await getPresignedGetUrl({ key, expiresInSeconds });
      pages.push({ page, url });
      needViewUpgrade.push(page);
      continue;
    }

    if (hasPrimary) {
      const key = previewPageKeyForVariant(documentId, versionId, page, variant);
      const url = await getPresignedGetUrl({ key, expiresInSeconds });
      pages.push({ page, url });
    } else {
      missing.push(page);
    }
  }

  const pagesToGenerate = [...new Set([...missing, ...needViewUpgrade])];

  if (isProcessing) {
    if (pages.length === 0) {
      return { pageCount: 0, pages: [], status: 'processing' };
    }
    return {
      pageCount: pageCount || rangeTo,
      pages,
      status: 'partial',
      ...(missing.length > 0 ? { pendingPages: missing } : {}),
    };
  }

  if (missing.length > 0 || needViewUpgrade.length > 0) {
    if (enqueueMissing && pagesToGenerate.length > 0) {
      const fromPage = Math.min(...pagesToGenerate);
      const toPage = Math.max(...pagesToGenerate);
      const lazyJob = await prisma.job.create({
        data: {
          type: 'preview-pages',
          status: 'queued',
          tenantId,
          payload: {
            documentId,
            versionId,
            s3Key: version.s3Key,
            fromPage,
            toPage,
          },
        },
      });
      await enqueuePreviewPagesJob(env, {
        jobId: lazyJob.id,
        documentId,
        versionId,
        tenantId,
        s3Key: version.s3Key,
        fromPage,
        toPage,
        requestId,
      });
    }
    return {
      pageCount,
      pages,
      status: 'partial',
      pendingPages: pagesToGenerate,
    };
  }

  return { pageCount, pages, status: 'ready' };
}
