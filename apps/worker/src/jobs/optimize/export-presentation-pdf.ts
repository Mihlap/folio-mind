import { previewPageKey, previewPageViewKey } from '@folio-mind/pdf-contracts';
import type { WorkerJobPayload } from '../../lib/config/job-types.js';
import type { WorkerEnv } from '../../lib/config/env.js';
import { getPrisma } from '../../lib/infra/prisma.js';
import {
  failOptimizeOperation,
  finalizeOptimizeVersion,
} from '../../lib/pdf/finalize-optimize-version.js';
import { buildPresentationPdf, type PresentationPdfSlide } from '../../lib/pdf/presentation-pdf.js';
import { isWorkerS3Configured, putObjectBuffer, tryGetObjectBuffer } from '../../lib/storage/s3.js';

type ExportPresentationPayload = WorkerJobPayload & {
  operationJobId?: string;
  presentationId?: string;
  sourceDocumentId?: string;
  sourceVersionId?: string;
  targetDocumentId?: string;
  targetVersionId?: string;
  targetS3Key?: string;
  requestId?: string;
};

type LoadedSlide = {
  id: string;
  title: string | null;
  subtitle: string | null;
  body: string | null;
  layoutVariant: string;
  background: string | null;
  sourcePage: number | null;
  mediaAssetId: string | null;
};

async function resolveSlideImage(
  slide: LoadedSlide,
  sourceDocumentId: string,
  sourceVersionId: string,
): Promise<{ bytes: Buffer; mime: string } | null> {
  if (slide.sourcePage != null && slide.sourcePage > 0) {
    const keys = [
      previewPageViewKey(sourceDocumentId, sourceVersionId, slide.sourcePage),
      previewPageKey(sourceDocumentId, sourceVersionId, slide.sourcePage),
    ];
    for (const key of keys) {
      const bytes = await tryGetObjectBuffer(key);
      if (bytes && bytes.length > 0) return { bytes, mime: 'image/png' };
    }
    return null;
  }

  if (!slide.mediaAssetId) return null;
  const prisma = getPrisma();
  const asset = await prisma.mediaAsset.findFirst({
    where: { id: slide.mediaAssetId },
    select: { s3Key: true, thumbS3Key: true, mimeType: true },
  });
  if (!asset) return null;
  for (const key of [asset.thumbS3Key, asset.s3Key]) {
    if (!key) continue;
    const bytes = await tryGetObjectBuffer(key);
    if (bytes && bytes.length > 0) {
      return { bytes, mime: asset.mimeType || 'image/png' };
    }
  }
  return null;
}

export async function processExportPresentationPdfJob(
  env: WorkerEnv,
  data: ExportPresentationPayload,
): Promise<void> {
  const {
    operationJobId,
    presentationId,
    sourceDocumentId,
    sourceVersionId,
    targetDocumentId,
    targetVersionId,
    targetS3Key,
    requestId,
  } = data;

  if (!operationJobId || !presentationId || !sourceDocumentId || !sourceVersionId || !targetDocumentId || !targetVersionId || !targetS3Key) {
    throw new Error('Export presentation: missing required payload fields');
  }

  const prisma = getPrisma();
  await prisma.job.update({ where: { id: operationJobId }, data: { status: 'processing' } });

  try {
    if (!isWorkerS3Configured()) {
      throw new Error('S3 не настроен в worker');
    }

    const target = await prisma.documentVersion.findUnique({
      where: { id: targetVersionId },
      select: { id: true },
    });
    if (!target) {
      await prisma.job.update({
        where: { id: operationJobId },
        data: { status: 'failed', payload: { skipped: 'version_deleted', error: 'Target version was deleted' } },
      });
      return;
    }

    const presentation = await prisma.presentation.findUnique({
      where: { id: presentationId },
      include: { slides: { orderBy: { position: 'asc' } } },
    });
    if (!presentation) throw new Error('Презентация не найдена');

    const slides: PresentationPdfSlide[] = [];
    for (const slide of presentation.slides) {
      const image = await resolveSlideImage(slide, sourceDocumentId, sourceVersionId);
      slides.push({
        title: slide.title,
        subtitle: slide.subtitle,
        body: slide.body,
        layoutVariant: slide.layoutVariant,
        background: slide.background,
        imageBytes: image?.bytes ?? null,
        imageMime: image?.mime ?? null,
      });
    }

    const built = await buildPresentationPdf(slides);

    const targetStillExists = await prisma.documentVersion.findUnique({
      where: { id: targetVersionId },
      select: { id: true },
    });
    if (!targetStillExists) {
      await prisma.job.update({
        where: { id: operationJobId },
        data: { status: 'failed', payload: { skipped: 'version_deleted', error: 'Target version was deleted' } },
      });
      return;
    }

    await putObjectBuffer({
      key: targetS3Key,
      body: built.buffer,
      contentType: 'application/pdf',
    });

    const previewJobId = await finalizeOptimizeVersion({
      env,
      data,
      documentId: targetDocumentId,
      targetVersionId,
      targetS3Key,
      outputBuffer: built.buffer,
      pageCount: built.pageCount,
      operation: 'export-presentation-pdf',
      operationMeta: {
        presentationId,
        sourceDocumentId,
        sourceVersionId,
        slideCount: built.pageCount,
      },
      requestId,
    });

    await prisma.job.update({
      where: { id: operationJobId },
      data: {
        status: 'completed',
        payload: {
          presentationId,
          targetDocumentId,
          targetVersionId,
          s3Key: targetS3Key,
          pageCount: built.pageCount,
          previewJobId,
        },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Export presentation failed';
    await failOptimizeOperation({ operationJobId, targetVersionId, error: message });
    throw err;
  }
}
