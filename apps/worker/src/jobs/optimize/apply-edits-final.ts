import { isUserUploadedSourceDocxKey } from '@folio-mind/pdf-contracts';
import type { WorkerJobPayload } from '../../lib/config/job-types.js';
import type { WorkerEnv } from '../../lib/config/env.js';
import { convertDocxToPdf, isGotenbergConfigured } from '../../lib/convert/gotenberg.js';
import { resolveDocxForEdits } from '../../lib/convert/resolve-docx.js';
import { applyEditsToDocx } from '../../lib/docx/apply-edits.js';
import { applyEditsViaPdfOverlay } from '../../lib/pdf/apply-edits-pdf-overlay.js';
import { getPrisma } from '../../lib/infra/prisma.js';
import { resolveS3Key } from '@folio-mind/pdf-contracts';
import { deleteObjectByKey, isWorkerS3Configured, putObjectBuffer } from '../../lib/storage/s3.js';
import {
  failOptimizeOperation,
  finalizeOptimizeVersion,
} from '../../lib/pdf/finalize-optimize-version.js';
type ApplyEditsFinalPayload = WorkerJobPayload & {
  operationJobId?: string;
  documentId?: string;
  editSourceVersionId?: string;
  rootVersionId?: string;
  sourceVersionId?: string;
  targetVersionId?: string;
  sourceS3Key?: string;
  targetS3Key?: string;
  userSourceDocxKey?: string | null;
  sourceDocxKey?: string | null;
  requestId?: string;
};
type Edit = {
  originalText: string;
  suggestion: string;
  page: number;
};
async function completeWithPdf(params: {
  env: WorkerEnv;
  data: ApplyEditsFinalPayload;
  operationJobId: string;
  documentId: string;
  editSourceVersionId: string;
  rootVersionId: string;
  targetVersionId: string;
  targetS3Key: string;
  edits: Edit[];
  pdfBuffer: Buffer;
  pageCount: number;
  applied: number;
  failed: number;
  method: 'docx' | 'pdf-overlay' | 'docx-fallback-overlay';
  docxS3Key?: string;
  docxSource?: string;
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
    targetS3Key,
    edits,
    pdfBuffer,
    pageCount,
    applied,
    failed,
    method,
    docxS3Key,
    docxSource,
    requestId,
  } = params;
  const prisma = getPrisma();
  const partial = failed > 0;
  await putObjectBuffer({
    key: targetS3Key,
    body: pdfBuffer,
    contentType: 'application/pdf',
  });
  const previewJobId = await finalizeOptimizeVersion({
    env,
    data,
    documentId,
    targetVersionId,
    targetS3Key,
    outputBuffer: pdfBuffer,
    pageCount,
    operation: 'apply-edits-final',
    operationMeta: {
      editSourceVersionId,
      rootVersionId,
      appliedCount: applied,
      failedCount: failed,
      method,
      docxSource,
    },
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
        status: partial ? 'partial' : 'success',
        message: partial
          ? `Применено ${applied} из ${edits.length} правок (${method === 'pdf-overlay' || method === 'docx-fallback-overlay' ? 'наложение на PDF' : 'DOCX'}).`
          : method === 'docx-fallback-overlay'
            ? 'Текст из PDF не совпал с Word — правки наложены на PDF. Для идеального качества проверьте поле «было» по DOCX.'
            : undefined,
      },
    },
  });
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
      edits.push({ originalText: quote, suggestion: ann.content, page: ann.page });
    }
    if (edits.length === 0) {
      throw new Error('Нет принятых правок для применения');
    }
    const docxUserKey = userSourceDocxKey ?? sourceDocxKey;
    const hasUserDocx = isUserUploadedSourceDocxKey(docxUserKey);
    const docxS3Key = resolveS3Key('processing', `${documentId}/${targetVersionId}/applied.docx`);
    if (hasUserDocx) {
      const { buffer: docxBuffer, source: docxSource } = await resolveDocxForEdits({
        documentId,
        rootVersionId: resolvedRootVersionId,
        sourcePdfS3Key: sourceS3Key,
        userSourceDocxKey: docxUserKey,
        legacyProcessingDocxKey: docxUserKey,
      });
      const { modifiedDocx, applied, failed } = await applyEditsToDocx(docxBuffer, edits);
      if (applied > 0) {
        await putObjectBuffer({
          key: docxS3Key,
          body: modifiedDocx,
          contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        });
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
                applied,
                failed,
                docxS3Key,
                status: 'docx_only',
                message:
                  'Правки в DOCX готовы. Запустите Gotenberg (docker compose, :3003) для PDF.',
              },
            },
          });
          return;
        }
        const pdfBuffer = await convertDocxToPdf(modifiedDocx);
        await completeWithPdf({
          env,
          data,
          operationJobId,
          documentId,
          editSourceVersionId: resolvedEditVersionId,
          rootVersionId: resolvedRootVersionId,
          targetVersionId,
          targetS3Key,
          edits,
          pdfBuffer,
          pageCount: 0,
          applied,
          failed,
          method: 'docx',
          docxS3Key,
          docxSource,
          requestId,
        });
        return;
      }
      console.warn('[apply-edits-final] DOCX: правки не найдены в Word, fallback на PDF overlay', {
        documentId,
        failed,
        editCount: edits.length,
      });
    }
    console.log('[apply-edits-final] PDF-only: overlay на исходном PDF', {
      documentId,
      editCount: edits.length,
      sourceS3Key,
    });
    const overlay = await applyEditsViaPdfOverlay(sourceS3Key, edits);
    if (overlay.applied === 0) {
      throw new Error(
        'Не удалось найти текст правок в PDF. Убедитесь, что в PDF есть текстовый слой, или загрузите исходный DOCX.',
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
      targetS3Key,
      edits,
      pdfBuffer: overlay.buffer,
      pageCount: overlay.pageCount,
      applied: overlay.applied,
      failed: overlay.failed,
      method: hasUserDocx ? 'docx-fallback-overlay' : 'pdf-overlay',
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
