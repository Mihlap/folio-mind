import { PDFDocument } from 'pdf-lib';
import type { WorkerJobPayload } from '../../lib/config/job-types.js';
import type { WorkerEnv } from '../../lib/config/env.js';
import { getPrisma } from '../../lib/infra/prisma.js';
import {
  deleteObjectByKey,
  getObjectBuffer,
  isWorkerS3Configured,
  putObjectBuffer,
} from '../../lib/storage/s3.js';
import { embedCyrillicFont, registerPdfFontkit } from '../../lib/pdf/pdf-cyrillic-font.js';
import { collectAcceptedEditsForPdf } from '../../lib/pdf/collect-accepted-edits.js';
import { renderAcceptedEditsAppendix } from '../../lib/pdf/render-edits-appendix.js';
import {
  failOptimizeOperation,
  finalizeOptimizeVersion,
} from '../../lib/pdf/finalize-optimize-version.js';
import { findAllTextPositions } from '../../lib/pdf/find-text-positions.js';
import { renderAllHighlights } from '../../lib/pdf/render-edits-highlights.js';
type ApplyAcceptedPayload = WorkerJobPayload & {
  operationJobId?: string;
  documentId?: string;
  sourceVersionId?: string;
  targetVersionId?: string;
  sourceS3Key?: string;
  targetS3Key?: string;
  requestId?: string;
};
export async function processApplyAcceptedSuggestionsJob(
  env: WorkerEnv,
  data: ApplyAcceptedPayload,
): Promise<void> {
  const {
    operationJobId,
    documentId,
    sourceVersionId,
    targetVersionId,
    sourceS3Key,
    targetS3Key,
    requestId,
  } = data;
  if (
    !operationJobId ||
    !documentId ||
    !sourceVersionId ||
    !targetVersionId ||
    !sourceS3Key ||
    !targetS3Key
  ) {
    throw new Error('Apply accepted suggestions: missing required fields');
  }
  const prisma = getPrisma();
  await prisma.job.update({ where: { id: operationJobId }, data: { status: 'processing' } });
  try {
    if (!isWorkerS3Configured()) {
      throw new Error('S3 не настроен в worker');
    }
    const exists = await prisma.documentVersion.findUnique({
      where: { id: targetVersionId },
      select: { id: true },
    });
    if (!exists) {
      await prisma.job.update({
        where: { id: operationJobId },
        data: {
          status: 'failed',
          payload: { skipped: 'version_deleted', error: 'Target version was deleted' },
        },
      });
      return;
    }
    const [aiAccepted, sourceAnnotations] = await Promise.all([
      prisma.aiSuggestion.findMany({
        where: { documentId, versionId: sourceVersionId, status: 'accepted' },
        orderBy: [{ page: 'asc' }, { createdAt: 'asc' }],
      }),
      prisma.documentAnnotation.findMany({
        where: { documentId, versionId: sourceVersionId, kind: 'accepted_edit' },
        orderBy: [{ page: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);
    const collected = collectAcceptedEditsForPdf(aiAccepted, sourceAnnotations);
    if (collected.length === 0) {
      throw new Error('Нет принятых правок для сборки PDF');
    }
    const edits = collected;
    const sourceBuffer = await getObjectBuffer(sourceS3Key);
    const pdfDoc = await PDFDocument.load(sourceBuffer);
    registerPdfFontkit(pdfDoc);
    const font = await embedCyrillicFont(pdfDoc);
    const highlightEdits = edits.map((edit) => ({
      page: edit.page,
      originalText: edit.originalText,
      suggestion: edit.suggestion,
      anchor: edit.anchor,
    }));
    const { positions: highlights } = await findAllTextPositions(sourceBuffer, highlightEdits);
    renderAllHighlights(pdfDoc, highlights);
    renderAcceptedEditsAppendix(
      pdfDoc,
      font,
      edits.map((edit) => ({
        page: edit.page,
        originalText: edit.originalText,
        suggestion: edit.suggestion,
        contentFormat: edit.contentFormat,
      })),
    );
    const outputBytes = await pdfDoc.save();
    const outputBuffer = Buffer.from(outputBytes);
    await putObjectBuffer({
      key: targetS3Key,
      body: outputBuffer,
      contentType: 'application/pdf',
    });
    const previewJobId = await finalizeOptimizeVersion({
      env,
      data,
      documentId,
      targetVersionId,
      targetS3Key,
      outputBuffer,
      pageCount: pdfDoc.getPageCount(),
      operation: 'apply-accepted-suggestions',
      operationMeta: { sourceVersionId, acceptedCount: edits.length },
      requestId,
    });
    if (sourceAnnotations.length > 0) {
      await prisma.documentAnnotation.createMany({
        data: sourceAnnotations.map((row) => ({
          documentId,
          versionId: targetVersionId,
          userId: row.userId,
          page: row.page,
          kind: row.kind,
          content: row.content,
          quote: row.quote,
          meta: row.meta ?? undefined,
        })),
      });
    }
    await prisma.job.update({
      where: { id: operationJobId },
      data: {
        status: 'completed',
        payload: {
          documentId,
          sourceVersionId,
          targetVersionId,
          acceptedCount: edits.length,
          previewJobId,
        },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Apply accepted suggestions failed';
    try {
      await deleteObjectByKey(targetS3Key);
    } catch {
      // Cleanup is best-effort; keep the original job failure visible.
    }
    try {
      await failOptimizeOperation({
        operationJobId,
        targetVersionId,
        error: message,
        payload: { documentId, sourceVersionId },
      });
    } catch {
      // Preserve the original error if the failure marker cannot be written.
    }
    throw err;
  }
}
