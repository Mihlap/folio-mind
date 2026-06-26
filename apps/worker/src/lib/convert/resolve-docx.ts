import {
  isDocxBuffer,
  isUserUploadedSourceDocxKey,
  preConvertedDocxKey,
} from '@folio-mind/pdf-contracts';
import { convertPdfToDocx, isPdfToDocxConfigured } from './pdf-to-docx.js';
import { getObjectBuffer, objectExists, putObjectBuffer } from '../storage/s3.js';
export type ResolvedDocx = {
  buffer: Buffer;
  s3Key: string;
  source: 'user' | 'cache' | 'converted';
};
export async function resolveDocxForEdits(params: {
  documentId: string;
  rootVersionId: string;
  sourcePdfS3Key: string;
  userSourceDocxKey?: string | null;
  legacyProcessingDocxKey?: string | null;
}): Promise<ResolvedDocx> {
  const { documentId, rootVersionId, sourcePdfS3Key, userSourceDocxKey, legacyProcessingDocxKey } =
    params;
  if (userSourceDocxKey && isUserUploadedSourceDocxKey(userSourceDocxKey)) {
    const buffer = await getObjectBuffer(userSourceDocxKey);
    if (!isDocxBuffer(buffer)) {
      throw new Error('Загруженный исходный DOCX повреждён или не является DOCX');
    }
    return { buffer, s3Key: userSourceDocxKey, source: 'user' };
  }
  const cachedKey = preConvertedDocxKey(documentId, rootVersionId);
  if (await objectExists(cachedKey)) {
    const buffer = await getObjectBuffer(cachedKey);
    if (isDocxBuffer(buffer)) {
      return { buffer, s3Key: cachedKey, source: 'cache' };
    }
  }
  if (legacyProcessingDocxKey?.includes('/processing/')) {
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
  const docxBuffer = await convertPdfToDocx(pdfBuffer);
  await putObjectBuffer({
    key: cachedKey,
    body: docxBuffer,
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  return { buffer: docxBuffer, s3Key: cachedKey, source: 'converted' };
}
