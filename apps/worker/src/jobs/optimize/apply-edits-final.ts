import { isUserUploadedSourceDocxKey } from '@folio-mind/pdf-contracts';
import { readAcceptedEditContentFormat, type EditContentFormat } from '@folio-mind/edit-markdown';
import type { WorkerJobPayload } from '../../lib/config/job-types.js';
import type { WorkerEnv } from '../../lib/config/env.js';
import { convertDocxToPdf, isGotenbergConfigured } from '../../lib/convert/gotenberg.js';
import { resolveDocxForEdits } from '../../lib/convert/resolve-docx.js';
import { applyEditsToDocx, type DocxEditResult } from '../../lib/docx/apply-edits.js';
import { applyEditsViaPdfOverlay, applyEditsViaPdfOverlayBuffer } from '../../lib/pdf/apply-edits-pdf-overlay.js';
import { inspectPdfTextLayer, type PdfTextLayerReport } from '../../lib/pdf/find-text-positions.js';
import { getPrisma } from '../../lib/infra/prisma.js';
import { resolveS3Key } from '@folio-mind/pdf-contracts';
import { deleteObjectByKey, isWorkerS3Configured, putObjectBuffer, tryGetObjectBuffer } from '../../lib/storage/s3.js';
import { classifyJobFailure, type JobFailureCategory } from '../../lib/job-failure.js';
import {
  failOptimizeOperation,
  finalizeOptimizeVersion,
} from '../../lib/pdf/finalize-optimize-version.js';
import { computeApplyEditsConfidence } from '../../lib/pdf/compute-apply-edits-confidence.js';
import {
  buildPageContextSearchVariants,
  getPageTextForEdit,
  loadPageTextHints,
} from '../../lib/docx/page-disambiguation.js';
import { resolveEditsForDocx, resolveEditsForPdfOverlay } from '../../lib/edits/resolve-edits.js';

class TargetVersionDeletedError extends Error {}

async function targetVersionExists(
  prisma: ReturnType<typeof getPrisma>,
  documentId: string,
  versionId: string,
): Promise<boolean> {
  const row = await prisma.documentVersion.findFirst({
    where: { id: versionId, documentId },
    select: { id: true },
  });
  return row !== null;
}

async function markJobVersionDeleted(operationJobId: string): Promise<void> {
  const prisma = getPrisma();
  await prisma.job.update({
    where: { id: operationJobId },
    data: {
      status: 'failed',
      payload: { skipped: 'version_deleted', error: 'Target version was deleted' },
    },
  });
}

type ApplyEditsFinalPayload = WorkerJobPayload & {
  operationJobId?: string;
  documentId?: string;
  editSourceVersionId?: string;
  rootVersionId?: string;
  sourceVersionId?: string;
  targetVersionId?: string;
  sourceS3Key?: string;
  editSourceS3Key?: string;
  targetS3Key?: string;
  userSourceDocxKey?: string | null;
  sourceDocxKey?: string | null;
  requestId?: string;
};

type Edit = {
  originalText: string;
  suggestion: string;
  contentFormat?: EditContentFormat;
  page: number;
  anchor?: { xNorm: number; yNorm: number };
};

function readPageAnchor(meta: unknown): { xNorm: number; yNorm: number } | undefined {
  if (!meta || typeof meta !== 'object') return undefined;
  const anchor = (meta as { pageAnchor?: { xNorm?: number; yNorm?: number } }).pageAnchor;
  if (typeof anchor?.xNorm !== 'number' || typeof anchor?.yNorm !== 'number') return undefined;
  if (anchor.xNorm < 0 || anchor.xNorm > 1 || anchor.yNorm < 0 || anchor.yNorm > 1) return undefined;
  return { xNorm: anchor.xNorm, yNorm: anchor.yNorm };
}

function readSuggestionId(meta: unknown): string | null {
  if (!meta || typeof meta !== 'object') return null;
  const suggestionId = (meta as { suggestionId?: unknown }).suggestionId;
  return typeof suggestionId === 'string' ? suggestionId : null;
}

type ApplyMethod = 'docx' | 'docx-converted' | 'pdf-overlay' | 'docx-fallback-overlay' | 'docx-hybrid';

type DocxPipelineResult = {
  applied: number;
  failed: number;
  ambiguous: number;
  modifiedDocx: Buffer;
  docxS3Key: string;
  docxSource: string;
  method: 'docx' | 'docx-converted';
  editResults: DocxEditResult[];
  ocrUsed?: boolean;
};

type ApplyFailureDetails = {
  retryable: boolean;
  category: JobFailureCategory;
  message: string;
  failedEdits: Array<{ page: number; originalText: string; suggestion: string }>;
  pdf: { textLayer: boolean; pageCount: number; pagesWithoutText: number[] } | null;
  docx: { source: string; ocrUsed: boolean } | null;
  ocrTried: boolean;
};

function buildTextNotFoundFailureDetails(params: {
  edits: Edit[];
  hasUserDocx: boolean;
  docxSource: string | undefined;
  ocrTried: boolean;
  pdfTextLayer: PdfTextLayerReport | null;
}): ApplyFailureDetails {
  const { edits, hasUserDocx, docxSource, ocrTried, pdfTextLayer } = params;
  let message: string;
  if (hasUserDocx) {
    message =
      'Не удалось собрать PDF: Word не отдал файл, а текст правок не найден в PDF. Проверьте поле «было».';
  } else if (pdfTextLayer && !pdfTextLayer.hasTextLayer) {
    message =
      'Правки не применились: в PDF нет текстового слоя (документ отсканирован или текст встроен как изображение), а исходный DOCX не загружен. Загрузите исходный DOCX или исправьте поле «было».';
  } else if (ocrTried) {
    message =
      'Правки не применились: текст «было» не найден ни в PDF, ни в DOCX (включая автоматический распознавание текста OCR). Проверьте точность поля «было» на странице правки или загрузите исходный DOCX.';
  } else {
    message =
      'Правки не применились: текст «было» не найден ни в PDF, ни в конвертированном DOCX. Проверьте точность поля «было» на странице правки или загрузите исходный DOCX.';
  }
  return {
    retryable: false,
    category: 'edit-text-not-found',
    message,
    failedEdits: edits.map((edit) => ({
      page: edit.page,
      originalText: edit.originalText,
      suggestion: edit.suggestion,
    })),
    pdf: pdfTextLayer
      ? {
          textLayer: pdfTextLayer.hasTextLayer,
          pageCount: pdfTextLayer.pageCount,
          pagesWithoutText: pdfTextLayer.pagesWithoutText,
        }
      : null,
    docx: docxSource ? { source: docxSource, ocrUsed: ocrTried } : null,
    ocrTried,
  };
}

async function completeWithPdf(params: {
  env: WorkerEnv;
  data: ApplyEditsFinalPayload;
  operationJobId: string;
  documentId: string;
  editSourceVersionId: string;
  rootVersionId: string;
  targetVersionId: string;
  sourceS3Key: string;
  editSourceS3Key?: string;
  targetS3Key: string;
  edits: Edit[];
  pdfBuffer: Buffer;
  pageCount: number;
  applied: number;
  failed: number;
  ambiguous?: number;
  method: ApplyMethod;
  docxS3Key?: string;
  docxSource?: string;
  editResults?: DocxEditResult[];
  requestId?: string;
}): Promise<void> {
  const {
    env,
    data,
    operationJobId,
    documentId,
    editSourceVersionId,
    rootVersionId,
    targetVersionId,
    sourceS3Key,
    editSourceS3Key,
    targetS3Key,
    edits,
    pdfBuffer,
    pageCount,
    applied,
    failed,
    ambiguous = 0,
    method,
    docxS3Key,
    docxSource,
    editResults,
    requestId,
  } = params;
  const prisma = getPrisma();
  const partial = failed > 0 || ambiguous > 0;
  if (!(await targetVersionExists(prisma, documentId, targetVersionId))) {
    if (docxS3Key) {
      await deleteObjectByKey(docxS3Key).catch(() => {});
    }
    throw new TargetVersionDeletedError('Target version was deleted');
  }
  await putObjectBuffer({
    key: targetS3Key,
    body: pdfBuffer,
    contentType: 'application/pdf',
  });
  const confidenceSourceS3Key = editSourceS3Key ?? sourceS3Key;
  let confidence;
  try {
    confidence = await computeApplyEditsConfidence({
      sourceS3Key: confidenceSourceS3Key,
      targetPdfBuffer: pdfBuffer,
      edits,
      method,
    });
  } catch (err) {
    console.warn('[apply-edits-final] confidence scoring skipped:', err);
  }
  const resolvedPageCount = pageCount > 0 ? pageCount : (confidence?.targetPageCount ?? 0);
  const previewJobId = await finalizeOptimizeVersion({
    env,
    data,
    documentId,
    targetVersionId,
    targetS3Key,
    outputBuffer: pdfBuffer,
    pageCount: resolvedPageCount,
    operation: 'apply-edits-final',
    operationMeta: {
      editSourceVersionId,
      rootVersionId,
      appliedCount: applied,
      failedCount: failed,
      method,
      docxSource,
    },
    confidence: confidence
      ? {
          level: confidence.level,
          score: confidence.score,
          summary: confidence.summary,
          details: confidence,
        }
      : undefined,
    requestId,
  });
  await prisma.job.update({
    where: { id: operationJobId },
    data: {
      status: 'completed',
      payload: {
        documentId,
        editSourceVersionId,
        rootVersionId,
        targetVersionId,
        applied,
        failed,
        ambiguous,
        previewJobId,
        docxS3Key,
        method,
        editResults,
        confidenceLevel: confidence?.level,
        confidenceScore: confidence?.score,
        confidenceSummary: confidence?.summary,
        status: partial ? 'partial' : 'success',
        message: partial
          ? `Применено ${applied} из ${edits.length} правок${ambiguous > 0 ? `, неоднозначно: ${ambiguous}` : ''} (${methodLabel(method)}).`
          : method === 'docx' || method === 'docx-converted'
            ? 'PDF и DOCX обновлены из Word.'
            : method === 'pdf-overlay'
              ? 'Правки наложены на PDF — те же страницы, без пересборки из Word.'
              : method === 'docx-fallback-overlay'
                ? 'Word не дал PDF — правки наложены на PDF. Сверьте результат или загрузите DOCX заново.'
                : undefined,
      },
    },
  });
}

function methodLabel(method: ApplyMethod): string {
  switch (method) {
    case 'docx':
      return 'исходный DOCX';
    case 'docx-converted':
      return 'PDF→DOCX';
    case 'pdf-overlay':
      return 'наложение на PDF';
    case 'docx-fallback-overlay':
      return 'наложение на PDF (fallback)';
    case 'docx-hybrid':
      return 'Word + наложение на PDF';
  }
}

async function runDocxPipelineOnce(
  params: {
    documentId: string;
    rootVersionId: string;
    editSourceVersionId: string;
    sourceS3Key: string;
    targetVersionId: string;
    userSourceDocxKey: string | null;
    edits: Edit[];
  },
  forceOcr: boolean,
): Promise<DocxPipelineResult | null> {
  try {
    const pageHints = await loadPageTextHints(params.documentId, params.editSourceVersionId);
    const { buffer, source: docxSourceKind } = await resolveDocxForEdits({
      documentId: params.documentId,
      rootVersionId: params.rootVersionId,
      sourcePdfS3Key: params.sourceS3Key,
      userSourceDocxKey: params.userSourceDocxKey,
      forceOcr,
    });
    const { modifiedDocx, applied, failed, ambiguous, results } = await applyEditsToDocx(
      buffer,
      resolveEditsForDocx(
        params.edits.map((edit) => ({
          originalText: edit.originalText,
          suggestion: edit.suggestion,
          contentFormat: edit.contentFormat ?? 'markdown',
          page: edit.page,
        })),
      ),
      {
        pageContextVariants: (edit) =>
          buildPageContextSearchVariants(getPageTextForEdit(pageHints, edit.page), edit.originalText),
      },
    );
    if (applied === 0 && ambiguous === 0) {
      console.warn('[apply-edits-final] DOCX: ни одна правка не найдена в Word', {
        documentId: params.documentId,
        failed,
        editCount: params.edits.length,
        docxSource: docxSourceKind,
        forceOcr,
      });
      return null;
    }
    const docxS3Key = resolveS3Key(
      'processing',
      `${params.documentId}/${params.targetVersionId}/applied.docx`,
    );
    const prisma = getPrisma();
    if (!(await targetVersionExists(prisma, params.documentId, params.targetVersionId))) {
      return null;
    }
    await putObjectBuffer({
      key: docxS3Key,
      body: modifiedDocx,
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    return {
      applied,
      failed,
      ambiguous,
      modifiedDocx,
      docxS3Key,
      docxSource: docxSourceKind,
      method: docxSourceKind === 'user' ? 'docx' : 'docx-converted',
      editResults: results,
      ocrUsed: forceOcr,
    };
  } catch (err) {
    console.warn(
      '[apply-edits-final] DOCX pipeline skipped:',
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

async function runDocxPipeline(
  params: {
    documentId: string;
    rootVersionId: string;
    editSourceVersionId: string;
    sourceS3Key: string;
    targetVersionId: string;
    userSourceDocxKey: string | null;
    edits: Edit[];
  },
  options?: { allowOcrRetry?: boolean },
): Promise<DocxPipelineResult | null> {
  const first = await runDocxPipelineOnce(params, false);
  if (first) return first;
  if (options?.allowOcrRetry && !params.userSourceDocxKey) {
    const ocr = await runDocxPipelineOnce(params, true);
    if (ocr) return ocr;
  }
  return null;
}

export async function processApplyEditsFinalJob(
  env: WorkerEnv,
  data: ApplyEditsFinalPayload,
): Promise<void> {
  const {
    operationJobId,
    documentId,
    editSourceVersionId,
    rootVersionId,
    sourceVersionId,
    targetVersionId,
    sourceS3Key,
    editSourceS3Key,
    targetS3Key,
    userSourceDocxKey,
    sourceDocxKey,
    requestId,
  } = data;
  const resolvedEditVersionId = editSourceVersionId ?? sourceVersionId;
  const resolvedRootVersionId = rootVersionId ?? sourceVersionId;
  if (
    !operationJobId ||
    !documentId ||
    !resolvedEditVersionId ||
    !resolvedRootVersionId ||
    !targetVersionId ||
    !sourceS3Key ||
    !targetS3Key
  ) {
    throw new Error('Apply edits final: missing required fields');
  }
  const overlaySourceS3Key = editSourceS3Key ?? sourceS3Key;
  const prisma = getPrisma();
  await prisma.job.update({ where: { id: operationJobId }, data: { status: 'processing' } });
  let edits: Edit[] = [];
  let docxPipeline: DocxPipelineResult | null = null;
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
        where: { documentId, versionId: resolvedEditVersionId, status: 'accepted' },
        orderBy: [{ page: 'asc' }, { createdAt: 'asc' }],
      }),
      prisma.documentAnnotation.findMany({
        where: { documentId, versionId: resolvedEditVersionId, kind: 'accepted_edit' },
        orderBy: [{ page: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);
    edits = [];
    const linkedSuggestionIds = new Set<string>();
    for (const ai of aiAccepted) {
      linkedSuggestionIds.add(ai.id);
      edits.push({ originalText: ai.originalText, suggestion: ai.suggestion, page: ai.page ?? 1 });
    }
    for (const ann of sourceAnnotations) {
      const quote = ann.quote?.trim() ?? '';
      const content = ann.content.trim();
      if (!quote || !content) continue;
      const suggestionId = readSuggestionId(ann.meta);
      if (suggestionId && linkedSuggestionIds.has(suggestionId)) continue;
      const anchor = readPageAnchor(ann.meta);
      edits.push({
        originalText: quote,
        suggestion: content,
        contentFormat: readAcceptedEditContentFormat(ann.meta),
        page: ann.page,
        ...(anchor ? { anchor } : {}),
      });
    }
    if (edits.length === 0) {
      throw new Error('Нет принятых правок для применения');
    }
    const docxUserKey = userSourceDocxKey ?? sourceDocxKey;
    const hasUserDocx = isUserUploadedSourceDocxKey(docxUserKey);

    const overlayEdits = resolveEditsForPdfOverlay(
      edits.map((edit) => ({
        originalText: edit.originalText,
        suggestion: edit.suggestion,
        contentFormat: edit.contentFormat ?? 'markdown',
        page: edit.page,
        anchor: edit.anchor,
      })),
    );

    if (!hasUserDocx) {
      try {
        const overlay = await applyEditsViaPdfOverlay(overlaySourceS3Key, overlayEdits);
        if (overlay.applied > 0) {
          console.log('[apply-edits-final] PDF overlay (primary, без исходного DOCX)', {
            documentId,
            editCount: edits.length,
            applied: overlay.applied,
            failed: overlay.failed,
          });
          await completeWithPdf({
            env,
            data,
            operationJobId,
            documentId,
            editSourceVersionId: resolvedEditVersionId,
            rootVersionId: resolvedRootVersionId,
            targetVersionId,
            sourceS3Key,
            editSourceS3Key: overlaySourceS3Key,
            targetS3Key,
            edits,
            pdfBuffer: overlay.buffer,
            pageCount: overlay.pageCount,
            applied: overlay.applied,
            failed: overlay.failed,
            method: 'pdf-overlay',
            requestId,
          });
          return;
        }
        console.warn('[apply-edits-final] PDF overlay применил 0 правок, пробуем DOCX-путь');
      } catch (err) {
        console.warn(
          '[apply-edits-final] PDF overlay не сработал, пробуем DOCX-путь:',
          err instanceof Error ? err.message : err,
        );
      }
    }

    docxPipeline = await runDocxPipeline(
      {
        documentId,
        rootVersionId: resolvedRootVersionId,
        editSourceVersionId: resolvedEditVersionId,
        sourceS3Key,
        targetVersionId,
        userSourceDocxKey: docxUserKey ?? null,
        edits,
      },
      { allowOcrRetry: true },
    );

    if (docxPipeline) {
      if (!isGotenbergConfigured(env.GOTENBERG_URL)) {
        throw new Error(
          'Gotenberg не настроен: DOCX с правками создан, но финальный PDF нельзя пометить готовым без конвертации.',
        );
      }
      try {
        let pdfBuffer = await convertDocxToPdf(docxPipeline.modifiedDocx);
        let appliedTotal = docxPipeline.applied;
        let failedTotal = docxPipeline.failed;
        const ambiguousTotal = docxPipeline.ambiguous;
        let method: ApplyMethod = docxPipeline.method;

        const pendingOverlay = resolveEditsForPdfOverlay(
          docxPipeline.editResults
            .filter((r) => r.status === 'failed')
            .flatMap((r) => {
              const source = edits.find((e) => e.originalText === r.originalText);
              if (!source) return [];
              return [
                {
                  originalText: r.originalText,
                  suggestion: source.suggestion,
                  contentFormat: source.contentFormat ?? 'plain',
                  page: r.page,
                  anchor: source.anchor,
                },
              ];
            }),
        );

        if (pendingOverlay.length > 0) {
          const hybrid = await applyEditsViaPdfOverlayBuffer(pdfBuffer, pendingOverlay);
          if (hybrid.applied > 0) {
            pdfBuffer = hybrid.buffer;
            appliedTotal += hybrid.applied;
            failedTotal = Math.max(0, failedTotal - hybrid.applied);
            method = 'docx-hybrid';
          }
        }

        await completeWithPdf({
          env,
          data,
          operationJobId,
          documentId,
          editSourceVersionId: resolvedEditVersionId,
          rootVersionId: resolvedRootVersionId,
          targetVersionId,
          sourceS3Key,
          editSourceS3Key: overlaySourceS3Key,
          targetS3Key,
          edits,
          pdfBuffer,
          pageCount: 0,
          applied: appliedTotal,
          failed: failedTotal,
          ambiguous: ambiguousTotal,
          method,
          docxS3Key: docxPipeline.docxS3Key,
          docxSource: docxPipeline.docxSource,
          editResults: docxPipeline.editResults,
          requestId,
        });
        return;
      } catch (err) {
        console.warn(
          '[apply-edits-final] Gotenberg failed after DOCX edits, trying PDF overlay:',
          err instanceof Error ? err.message : err,
        );
      }
    }

    console.log('[apply-edits-final] PDF overlay fallback', {
      documentId,
      editCount: edits.length,
      hadUserDocx: hasUserDocx,
      docxPipelineApplied: docxPipeline?.applied ?? 0,
    });
    const overlay = await applyEditsViaPdfOverlay(overlaySourceS3Key, overlayEdits);
    if (overlay.applied === 0) {
      let textLayerReport: PdfTextLayerReport | null = null;
      try {
        const pdfBytes = await tryGetObjectBuffer(overlaySourceS3Key);
        if (pdfBytes) {
          textLayerReport = await inspectPdfTextLayer(pdfBytes);
        }
      } catch {
        textLayerReport = null;
      }
      const details = buildTextNotFoundFailureDetails({
        edits,
        hasUserDocx,
        docxSource: docxPipeline?.docxSource,
        ocrTried: docxPipeline?.ocrUsed ?? false,
        pdfTextLayer: textLayerReport,
      });
      console.warn('[apply-edits-final] применено 0 правок, фиксируем детали ошибки', {
        documentId,
        message: details.message,
        pdf: details.pdf,
        docx: details.docx,
      });
      await failOptimizeOperation({
        operationJobId,
        targetVersionId,
        error: details.message,
        payload: { documentId, editSourceVersionId: resolvedEditVersionId },
        failureDetails: details,
      });
      return;
    }
    await completeWithPdf({
      env,
      data,
      operationJobId,
      documentId,
      editSourceVersionId: resolvedEditVersionId,
      rootVersionId: resolvedRootVersionId,
      targetVersionId,
      sourceS3Key,
      editSourceS3Key: overlaySourceS3Key,
      targetS3Key,
      edits,
      pdfBuffer: overlay.buffer,
      pageCount: overlay.pageCount,
      applied: overlay.applied,
      failed: overlay.failed,
      method: docxPipeline || hasUserDocx ? 'docx-fallback-overlay' : 'pdf-overlay',
      docxS3Key: docxPipeline?.docxS3Key,
      docxSource: docxPipeline?.docxSource,
      editResults: docxPipeline?.editResults,
      requestId,
    });
  } catch (err) {
    if (err instanceof TargetVersionDeletedError) {
      try {
        await markJobVersionDeleted(operationJobId);
      } catch {
        // Keep the original error visible if the marker cannot be written.
      }
      return;
    }
    const message = err instanceof Error ? err.message : 'Apply edits final failed';
    const classification = classifyJobFailure(err);
    console.error('[apply-edits-final] failed:', message, {
      category: classification.category,
      retryable: classification.retryable,
    });
    try {
      await deleteObjectByKey(targetS3Key);
    } catch {
      // Cleanup is best-effort; keep the original job failure visible.
    }
    const failureDetails: ApplyFailureDetails = {
      retryable: classification.retryable,
      category: classification.category,
      message,
      failedEdits: edits.map((edit) => ({
        page: edit.page,
        originalText: edit.originalText,
        suggestion: edit.suggestion,
      })),
      pdf: null,
      docx: docxPipeline ? { source: docxPipeline.docxSource, ocrUsed: docxPipeline.ocrUsed ?? false } : null,
      ocrTried: docxPipeline?.ocrUsed ?? false,
    };
    try {
      await failOptimizeOperation({
        operationJobId,
        targetVersionId,
        error: message,
        payload: { documentId, editSourceVersionId: resolvedEditVersionId },
        failureDetails,
      });
    } catch {
      // Preserve the original error if the failure marker cannot be written.
    }
    throw err;
  }
}
