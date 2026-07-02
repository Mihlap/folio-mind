import { isDocxBuffer, preConvertedDocxKey } from '@folio-mind/pdf-contracts';
import type { WorkerJobPayload } from '../../lib/config/job-types.js';
import type { WorkerEnv } from '../../lib/config/env.js';
import { convertPdfToDocx, isPdfToDocxConfigured } from '../../lib/convert/pdf-to-docx.js';
import { getPrisma } from '../../lib/infra/prisma.js';
import { getObjectBuffer, isWorkerS3Configured, putObjectBuffer } from '../../lib/storage/s3.js';
type PreConvertPayload = WorkerJobPayload & {
  documentId?: string;
  versionId?: string;
  s3Key?: string;
};
export async function processPreConvertPdfJob(
  env: WorkerEnv,
  data: PreConvertPayload,
): Promise<void> {
  const { documentId, versionId, s3Key } = data;
  if (!documentId || !versionId || !s3Key) {
    console.warn('[pre-convert] missing required fields', { documentId, versionId, s3Key });
    return;
  }
  if (!isWorkerS3Configured()) {
    console.warn('[pre-convert] S3 не настроен');
    return;
  }
  if (!isPdfToDocxConfigured(env.PDF_TO_DOCX_URL ?? env.JODCONVERTER_URL)) {
    console.warn('[pre-convert] PDF→DOCX service не настроен (PDF_TO_DOCX_URL)');
    return;
  }
  const maxPreconvertMb = env.PRECONVERT_MAX_PDF_MB;
  const prisma = getPrisma();
  try {
    const version = await prisma.documentVersion.findUnique({
      where: { id: versionId },
      select: { id: true, sourceDocxKey: true, status: true },
    });
    if (!version) {
      console.warn(`[pre-convert] version ${versionId} not found, skipping`);
      return;
    }
    const docxS3Key = preConvertedDocxKey(documentId, versionId);
    const pdfBuffer = await getObjectBuffer(s3Key);
    const sizeMb = pdfBuffer.length / (1024 * 1024);
    if (maxPreconvertMb > 0 && sizeMb > maxPreconvertMb) {
      console.warn(
        `[pre-convert] skip PDF→DOCX for version ${versionId}: ${sizeMb.toFixed(1)} MB > limit ${maxPreconvertMb} MB (фоновый pre-convert). ` +
          'Для «Применить правки» загрузите исходный DOCX или конвертация пойдёт по запросу.',
      );
      return;
    }
    console.log(`[pre-convert] PDF→DOCX start for version ${versionId} (${sizeMb.toFixed(1)} MB)`);
    const docxBuffer = await convertPdfToDocx(pdfBuffer);
    if (!isDocxBuffer(docxBuffer)) {
      throw new Error('JODConverter вернул не DOCX');
    }
    await putObjectBuffer({
      key: docxS3Key,
      body: docxBuffer,
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    console.log(`[pre-convert] PDF→DOCX done for version ${versionId}`, { docxS3Key });
  } catch (err) {
    console.warn(`[pre-convert] PDF→DOCX failed for version ${versionId}:`, err);
  }
}
