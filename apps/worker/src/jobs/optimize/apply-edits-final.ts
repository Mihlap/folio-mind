import { isUserUploadedSourceDocxKey } from '@folio-mind/pdf-contracts';
import type { WorkerJobPayload } from '../../lib/config/job-types.js';
import type { WorkerEnv } from '../../lib/config/env.js';
import { convertDocxToPdf, isGotenbergConfigured } from '../../lib/convert/gotenberg.js';
import { resolveDocxForEdits } from '../../lib/convert/resolve-docx.js';
import { applyEditsToDocx, type DocxEditResult } from '../../lib/docx/apply-edits.js';
import { applyEditsViaPdfOverlay } from '../../lib/pdf/apply-edits-pdf-overlay.js';
import { getPrisma } from '../../lib/infra/prisma.js';
import { resolveS3Key } from '@folio-mind/pdf-contracts';
import { deleteObjectByKey, isWorkerS3Configured, putObjectBuffer } from '../../lib/storage/s3.js';
import {
  failOptimizeOperation,
  finalizeOptimizeVersion,
} from '../../lib/pdf/finalize-optimize-version.js';
import { computeApplyEditsConfidence } from '../../lib/pdf/compute-apply-edits-confidence.js';

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

type ApplyMethod = 'docx' | 'docx-converted' | 'pdf-overlay' | 'docx-fallback-overlay';

type DocxPipelineResult = {
  applied: number;
  failed: number;
  modifiedDocx: Buffer;
  docxS3Key: string;
  docxSource: string;
  method: 'docx' | 'docx-converted';
  editResults: DocxEditResult[];
};

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
    method,
    docxS3Key,
    docxSource,
    editResults,
    requestId,
  } = params;
  const prisma = getPrisma();
  const partial = failed > 0;
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
        previewJobId,
        docxS3Key,
        method,
        editResults,
        confidenceLevel: confidence?.level,
        confidenceScore: confidence?.score,
        confidenceSummary: confidence?.summary,
        status: partial ? 'partial' : 'success',
        message: partial
          ? `Применено ${applied} из ${edits.length} правок (${methodLabel(method)}).`
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
  }
}

async function runDocxPipeline(params: {
  documentId: string;
  rootVersionId: string;
  sourceS3Key: string;
  targetVersionId: string;
  userSourceDocxKey: string | null;
  edits: Edit[];
}): Promise<DocxPipelineResult | null> {
  try {
    const { buffer, source: docxSourceKind } = await resolveDocxForEdits({
      documentId: params.documentId,
      rootVersionId: params.rootVersionId,
      sourcePdfS3Key: params.sourceS3Key,
      userSourceDocxKey: params.userSourceDocxKey,
    });
    const { modifiedDocx, applied, failed, results } = await applyEditsToDocx(buffer, params.edits);
    if (applied === 0) {
      console.warn('[apply-edits-final] DOCX: ни одна правка не найдена в Word', {
        documentId: params.documentId,
        failed,
        editCount: params.edits.length,
        docxSource: docxSourceKind,
      });
      return null;
    }
    const docxS3Key = resolveS3Key(
      'processing',
      `${params.documentId}/${params.targetVersionId}/applied.docx`,
    );
    await putObjectBuffer({
      key: docxS3Key,
      body: modifiedDocx,
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    return {
      applied,
      failed,
      modifiedDocx,
      docxS3Key,
      docxSource: docxSourceKind,
      method: docxSourceKind === 'user' ? 'docx' : 'docx-converted',
      editResults: results,
    };
  } catch (err) {
    console.warn(
      '[apply-edits-final] DOCX pipeline skipped:',
      err instanceof Error ? err.message : err,
    );
    return null;
  }
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
        data: { status: 'completed', payload: { skipped: 'version_deleted' } },
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
    const edits: Edit[] = [];
    for (const ai of aiAccepted) {
      edits.push({ originalText: ai.originalText, suggestion: ai.suggestion, page: ai.page ?? 1 });
    }
    for (const ann of sourceAnnotations) {
      const quote = ann.quote?.trim() ?? '';
      if (!quote) continue;
      const anchor = readPageAnchor(ann.meta);
      edits.push({
        originalText: quote,
        suggestion: ann.content,
        page: ann.page,
        ...(anchor ? { anchor } : {}),
      });
    }
    if (edits.length === 0) {
      throw new Error('Нет принятых правок для применения');
    }
    const docxUserKey = userSourceDocxKey ?? sourceDocxKey;
    const hasUserDocx = isUserUploadedSourceDocxKey(docxUserKey);

    const docxPipeline = await runDocxPipeline({
      documentId,
      rootVersionId: resolvedRootVersionId,
      sourceS3Key,
      targetVersionId,
      userSourceDocxKey: docxUserKey ?? null,
      edits,
    });

    if (docxPipeline) {
      if (!isGotenbergConfigured(env.GOTENBERG_URL)) {
        await prisma.documentVersion.update({
          where: { id: targetVersionId },
          data: { status: 'ready' },
        });
        await prisma.job.update({
          where: { id: operationJobId },
          data: {
            status: 'completed',
            payload: {
              targetVersionId,
              applied: docxPipeline.applied,
              failed: docxPipeline.failed,
              docxS3Key: docxPipeline.docxS3Key,
              method: docxPipeline.method,
              editResults: docxPipeline.editResults,
              status: 'docx_only',
              message:
                'Правки в DOCX готовы. Запустите Gotenberg (docker compose, :3003) для PDF.',
            },
          },
        });
        return;
      }
      try {
        const pdfBuffer = await convertDocxToPdf(docxPipeline.modifiedDocx);
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
          applied: docxPipeline.applied,
          failed: docxPipeline.failed,
          method: docxPipeline.method,
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
    const overlay = await applyEditsViaPdfOverlay(overlaySourceS3Key, edits);
    if (overlay.applied === 0) {
      throw new Error(
        hasUserDocx
          ? 'Не удалось собрать PDF: Word не отдал файл, а текст правок не найден в PDF. Проверьте поле «было».'
          : 'Не удалось найти текст правок в PDF. Убедитесь, что в PDF есть текстовый слой, или загрузите исходный DOCX.',
      );
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
    const message = err instanceof Error ? err.message : 'Apply edits final failed';
    console.error('[apply-edits-final] failed:', message);
    try {
      await deleteObjectByKey(targetS3Key);
    } catch {}
    try {
      await failOptimizeOperation({
        operationJobId,
        targetVersionId,
        error: message,
        payload: { documentId, editSourceVersionId: resolvedEditVersionId },
      });
    } catch {}
    throw err;
  }
}
