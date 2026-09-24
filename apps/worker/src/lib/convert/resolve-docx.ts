import {
  isDocxBuffer,
  isUserUploadedSourceDocxKey,
  preConvertedDocxKey,
  preConvertedOcrDocxKey,
} from '@folio-mind/pdf-contracts';
import { convertPdfToDocx, isPdfToDocxConfigured } from './pdf-to-docx.js';
import { storeDocxLayoutRisk } from './docx-layout-risk.js';
import { getObjectBuffer, objectExists, putObjectBuffer } from '../storage/s3.js';
export type ResolvedDocx = {
  buffer: Buffer;
  s3Key: string;
  source: 'user' | 'cache' | 'converted' | 'converted-ocr';
  ocrUsed?: boolean;
};
export async function resolveDocxForEdits(params: {
  documentId: string;
  rootVersionId: string;
  sourcePdfS3Key: string;
  userSourceDocxKey?: string | null;
  legacyProcessingDocxKey?: string | null;
  forceOcr?: boolean;
}): Promise<ResolvedDocx> {
  const {
    documentId,
    rootVersionId,
    sourcePdfS3Key,
    userSourceDocxKey,
    legacyProcessingDocxKey,
    forceOcr,
  } = params;
  if (userSourceDocxKey && isUserUploadedSourceDocxKey(userSourceDocxKey)) {
    const buffer = await getObjectBuffer(userSourceDocxKey);
    if (!isDocxBuffer(buffer)) {
      throw new Error('Загруженный исходный DOCX повреждён или не является DOCX');
    }
    return { buffer, s3Key: userSourceDocxKey, source: 'user' };
  }
  const cachedKey = forceOcr
    ? preConvertedOcrDocxKey(documentId, rootVersionId)
    : preConvertedDocxKey(documentId, rootVersionId);
  if (await objectExists(cachedKey)) {
    const buffer = await getObjectBuffer(cachedKey);
    if (isDocxBuffer(buffer)) {
      return {
        buffer,
        s3Key: cachedKey,
        source: forceOcr ? 'converted-ocr' : 'cache',
        ocrUsed: forceOcr,
      };
    }
  }
  if (!forceOcr && legacyProcessingDocxKey?.includes('/processing/')) {
    const buffer = await getObjectBuffer(legacyProcessingDocxKey);
    if (isDocxBuffer(buffer)) {
      return { buffer, s3Key: legacyProcessingDocxKey, source: 'cache' };
    }
  }
  if (!isPdfToDocxConfigured()) {
    throw new Error(
      'Нет исходного DOCX и сервис PDF→DOCX не настроен. Загрузите PDF вместе с DOCX или запустите docker compose (pdf2docx :8080).',
    );
  }
  const pdfBuffer = await getObjectBuffer(sourcePdfS3Key);
  const docxBuffer = await convertPdfToDocx(pdfBuffer, { forceOcr });
  await putObjectBuffer({
    key: cachedKey,
    body: docxBuffer,
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  try {
    await storeDocxLayoutRisk({ docxBuffer, documentId, versionId: rootVersionId });
  } catch (err) {
    console.warn('[docx-layout-risk] failed to store layout risk', err);
  }
  return {
    buffer: docxBuffer,
    s3Key: cachedKey,
    source: forceOcr ? 'converted-ocr' : 'converted',
    ocrUsed: forceOcr,
  };
}