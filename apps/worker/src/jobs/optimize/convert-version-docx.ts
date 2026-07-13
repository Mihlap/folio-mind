import type { WorkerJobPayload } from '../../lib/config/job-types.js';
import type { WorkerEnv } from '../../lib/config/env.js';
import { getPrisma } from '../../lib/infra/prisma.js';
import { resolveDocxForEdits } from '../../lib/convert/resolve-docx.js';
import { isWorkerS3Configured } from '../../lib/storage/s3.js';

type ConvertVersionDocxPayload = WorkerJobPayload & {
  operationJobId?: string;
  documentId?: string;
  versionId?: string;
  sourcePdfS3Key?: string;
  userSourceDocxKey?: string | null;
};

export async function processConvertVersionDocxJob(
  _env: WorkerEnv,
  data: ConvertVersionDocxPayload,
): Promise<void> {
  const { operationJobId, documentId, versionId, sourcePdfS3Key, userSourceDocxKey } = data;
  if (!operationJobId || !documentId || !versionId || !sourcePdfS3Key) {
    throw new Error('Convert version DOCX: missing required fields');
  }

  const prisma = getPrisma();
  await prisma.job.update({ where: { id: operationJobId }, data: { status: 'processing' } });

  try {
    if (!isWorkerS3Configured()) {
      throw new Error('S3 не настроен в worker');
    }

    const resolved = await resolveDocxForEdits({
      documentId,
      rootVersionId: versionId,
      sourcePdfS3Key,
      userSourceDocxKey,
    });

    await prisma.job.update({
      where: { id: operationJobId },
      data: {
        status: 'completed',
        payload: {
          documentId,
          versionId,
          docxS3Key: resolved.s3Key,
          source: resolved.source,
          message:
            resolved.source === 'user'
              ? 'Исходный DOCX уже прикреплён к версии.'
              : resolved.source === 'cache'
                ? 'DOCX уже был подготовлен ранее.'
                : 'PDF конвертирован в DOCX.',
        },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Не удалось конвертировать PDF в DOCX';
    await prisma.job.update({
      where: { id: operationJobId },
      data: {
        status: 'failed',
        payload: { documentId, versionId, error: message },
      },
    });
    throw err;
  }
}
