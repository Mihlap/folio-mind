import { PDFDocument, rgb } from 'pdf-lib';
import type { WorkerJobPayload } from '../../lib/config/job-types.js';
import type { WorkerEnv } from '../../lib/config/env.js';
import { getPrisma } from '../../lib/infra/prisma.js';
import {
  deleteObjectByKey,
  getObjectBuffer,
  isWorkerS3Configured,
  putObjectBuffer,
} from '../../lib/storage/s3.js';
import {
  embedCyrillicFont,
  registerPdfFontkit,
  truncateForPdf,
} from '../../lib/pdf/pdf-cyrillic-font.js';
import { failOptimizeOperation, finalizeOptimizeVersion } from '../../lib/pdf/finalize-optimize-version.js';

type ApplyAcceptedPayload = WorkerJobPayload & {
  operationJobId?: string;
  documentId?: string;
  sourceVersionId?: string;
  targetVersionId?: string;
  sourceS3Key?: string;
  targetS3Key?: string;
  requestId?: string;
};

type AcceptedEdit = {
  page: number;
  originalText: string;
  suggestion: string;
};

const MAX_EDITS_PER_PAGE = 3;
const FOOTER_FONT_SIZE = 7;
const LINE_HEIGHT = 9;

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
        data: { status: 'completed', payload: { skipped: 'version_deleted' } },
      });
      return;
    }

    const accepted = await prisma.aiSuggestion.findMany({
      where: { documentId, versionId: sourceVersionId, status: 'accepted' },
      orderBy: [{ page: 'asc' }, { createdAt: 'asc' }],
    });
    if (accepted.length === 0) {
      throw new Error('Нет принятых правок для сборки PDF');
    }

    const edits: AcceptedEdit[] = accepted.map((row) => ({
      page: row.page && row.page >= 1 ? row.page : 1,
      originalText: row.originalText,
      suggestion: row.suggestion,
    }));

    const sourceBuffer = await getObjectBuffer(sourceS3Key);
    const pdfDoc = await PDFDocument.load(sourceBuffer);
    registerPdfFontkit(pdfDoc);
    const font = await embedCyrillicFont(pdfDoc);
    const pageCount = pdfDoc.getPageCount();

    const byPage = new Map<number, AcceptedEdit[]>();
    for (const edit of edits) {
      const page = Math.min(edit.page, pageCount);
      const list = byPage.get(page) ?? [];
      list.push({ ...edit, page });
      byPage.set(page, list);
    }

    for (const [pageNum, pageEdits] of byPage) {
      const page = pdfDoc.getPage(pageNum - 1);
      const { width } = page.getSize();
      const shown = pageEdits.slice(0, MAX_EDITS_PER_PAGE);
      const boxHeight = Math.min(8 + shown.length * 22, 90);

      page.drawRectangle({
        x: 10,
        y: 10,
        width: width - 20,
        height: boxHeight,
        color: rgb(1, 0.98, 0.9),
        borderColor: rgb(0.75, 0.72, 0.55),
        borderWidth: 0.5,
      });

      let y = 10 + boxHeight - 10;
      page.drawText('Принятые правки (надстройка)', {
        x: 14,
        y,
        size: FOOTER_FONT_SIZE,
        font,
        color: rgb(0.35, 0.3, 0.1),
      });
      y -= LINE_HEIGHT + 2;

      for (const edit of shown) {
        page.drawText(`Было: ${truncateForPdf(edit.originalText, 90)}`, {
          x: 14,
          y,
          size: FOOTER_FONT_SIZE,
          font,
          color: rgb(0.45, 0.45, 0.45),
          maxWidth: width - 28,
        });
        y -= LINE_HEIGHT;
        page.drawText(`Стало: ${truncateForPdf(edit.suggestion, 90)}`, {
          x: 14,
          y,
          size: FOOTER_FONT_SIZE,
          font,
          color: rgb(0.05, 0.35, 0.15),
          maxWidth: width - 28,
        });
        y -= LINE_HEIGHT + 4;
      }
    }

    const appendix = pdfDoc.addPage();
    const { width: aw, height: ah } = appendix.getSize();
    let y = ah - 40;
    const titleSize = 11;
    const bodySize = 8;

    appendix.drawText('Приложение: согласованные правки ИИ', {
      x: 40,
      y,
      size: titleSize,
      font,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= 24;
    appendix.drawText(
      'Исходный текст страниц сохранён. Ниже — полный список принятых формулировок. Для юридической силы сверьте с договором.',
      {
        x: 40,
        y,
        size: bodySize,
        font,
        color: rgb(0.35, 0.35, 0.35),
        maxWidth: aw - 80,
      },
    );
    y -= 36;

    for (const [index, edit] of edits.entries()) {
      if (y < 48) break;
      appendix.drawText(`${index + 1}. Стр. ${edit.page}`, {
        x: 40,
        y,
        size: bodySize,
        font,
        color: rgb(0.2, 0.2, 0.2),
      });
      y -= LINE_HEIGHT;
      appendix.drawText(`Было: ${truncateForPdf(edit.originalText, 160)}`, {
        x: 48,
        y,
        size: bodySize,
        font,
        maxWidth: aw - 96,
      });
      y -= LINE_HEIGHT;
      appendix.drawText(`Стало: ${truncateForPdf(edit.suggestion, 160)}`, {
        x: 48,
        y,
        size: bodySize,
        font,
        maxWidth: aw - 96,
      });
      y -= LINE_HEIGHT + 6;
    }

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
      operationMeta: { sourceVersionId, acceptedCount: accepted.length },
      requestId,
    });

    await prisma.job.update({
      where: { id: operationJobId },
      data: {
        status: 'completed',
        payload: {
          documentId,
          sourceVersionId,
          targetVersionId,
          acceptedCount: accepted.length,
          previewJobId,
        },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Apply accepted suggestions failed';
    try {
      await deleteObjectByKey(targetS3Key);
    } catch {
      /* ignore */
    }
    try {
      await failOptimizeOperation({
        operationJobId,
        targetVersionId,
        error: message,
        payload: { documentId, sourceVersionId },
      });
    } catch {
      /* ignore */
    }
    throw err;
  }
}
