import { highlightEditsDocxKey } from '@folio-mind/pdf-contracts';
import type { WorkerJobPayload } from '../../lib/config/job-types.js';
import type { WorkerEnv } from '../../lib/config/env.js';
import { resolveDocxForEdits } from '../../lib/convert/resolve-docx.js';
import { highlightEditsInDocx } from '../../lib/docx/highlight-edits.js';
import {
  buildPageContextSearchVariants,
  getPageTextForEdit,
  loadPageTextHints,
} from '../../lib/docx/page-disambiguation.js';
import { collectAcceptedEditsForPdf } from '../../lib/pdf/collect-accepted-edits.js';
import { getPrisma } from '../../lib/infra/prisma.js';
import { isWorkerS3Configured, putObjectBuffer } from '../../lib/storage/s3.js';

type ExportHighlightPayload = WorkerJobPayload & {
  operationJobId?: string;
  documentId?: string;
  versionId?: string;
  rootVersionId?: string;
  sourceS3Key?: string;
  userSourceDocxKey?: string | null;
};

export async function processExportHighlightDocxJob(
  _env: WorkerEnv,
  data: ExportHighlightPayload,
): Promise<void> {
  const { operationJobId, documentId, versionId, rootVersionId, sourceS3Key, userSourceDocxKey } =
    data;
  if (!operationJobId || !documentId || !versionId || !rootVersionId || !sourceS3Key) {
    throw new Error('Export highlight DOCX: missing required fields');
  }
  const prisma = getPrisma();
  await prisma.job.update({ where: { id: operationJobId }, data: { status: 'processing' } });
  try {
    if (!isWorkerS3Configured()) {
      throw new Error('S3 не настроен в worker');
    }
    const [aiAccepted, sourceAnnotations] = await Promise.all([
      prisma.aiSuggestion.findMany({
        where: { documentId, versionId, status: 'accepted' },
        orderBy: [{ page: 'asc' }, { createdAt: 'asc' }],
      }),
      prisma.documentAnnotation.findMany({
        where: { documentId, versionId, kind: 'accepted_edit' },
        orderBy: [{ page: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);
    const edits = collectAcceptedEditsForPdf(aiAccepted, sourceAnnotations);
    if (edits.length === 0) {
      throw new Error('Нет принятых правок для экспорта');
    }
    const pageHints = await loadPageTextHints(documentId, versionId);
    const resolved = await resolveDocxForEdits({
      documentId,
      rootVersionId,
      sourcePdfS3Key: sourceS3Key,
      userSourceDocxKey,
    });
    const { highlightedDocx, highlighted, failed } = await highlightEditsInDocx(
      resolved.buffer,
      edits.map((edit) => ({
        originalText: edit.originalText,
        suggestion: edit.suggestion,
        contentFormat: edit.contentFormat,
        page: edit.page,
      })),
      {
        pageContextVariants: (edit) =>
          buildPageContextSearchVariants(
            getPageTextForEdit(pageHints, edit.page),
            edit.originalText,
          ),
      },
    );
    if (highlighted === 0) {
      throw new Error(
        failed > 0
          ? 'Текст правок не найден в DOCX — загрузите исходный DOCX или проверьте поле «Было».'
          : 'Нет правок для подсветки в DOCX.',
      );
    }
    const exportKey = highlightEditsDocxKey(documentId, versionId);
    const versionStillThere = await prisma.documentVersion.findFirst({
      where: { id: versionId, documentId },
      select: { id: true },
    });
    if (!versionStillThere) {
      await prisma.job.update({
        where: { id: operationJobId },
        data: {
          status: 'failed',
          payload: { skipped: 'version_deleted', error: 'Target version was deleted' },
        },
      });
      return;
    }
    await putObjectBuffer({
      key: exportKey,
      body: highlightedDocx,
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    await prisma.job.update({
      where: { id: operationJobId },
      data: {
        status: 'completed',
        payload: {
          documentId,
          versionId,
          highlighted,
          failed,
          docxS3Key: exportKey,
          status: failed > 0 ? 'partial' : 'success',
          message:
            failed > 0
              ? `Подсвечено ${highlighted} из ${edits.length} правок в DOCX.`
              : 'DOCX с подсветкой правок готов.',
        },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Export highlight DOCX failed';
    await prisma.job.update({
      where: { id: operationJobId },
      data: { status: 'failed', payload: { error: message } },
    });
    throw err;
  }
}
