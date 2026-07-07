import type { WorkerJobPayload } from '../../lib/config/job-types.js';
import type { WorkerEnv } from '../../lib/config/env.js';
import { getPrisma } from '../../lib/infra/prisma.js';
import { analyzePrintReadiness } from '../../lib/pdf/print-readiness.js';
import { getObjectBuffer, isWorkerS3Configured } from '../../lib/storage/s3.js';

type PrintReadinessPayload = WorkerJobPayload & {
  operationJobId?: string;
  documentId?: string;
  versionId?: string;
  sourceS3Key?: string;
};

export async function processPrintReadinessJob(
  _env: WorkerEnv,
  data: PrintReadinessPayload,
): Promise<void> {
  const { operationJobId, documentId, versionId, sourceS3Key } = data;
  if (!operationJobId || !documentId || !versionId || !sourceS3Key) {
    throw new Error('Print readiness: missing required fields');
  }

  const prisma = getPrisma();
  await prisma.job.update({ where: { id: operationJobId }, data: { status: 'processing' } });

  try {
    if (!isWorkerS3Configured()) {
      throw new Error('S3 не настроен в worker');
    }

    const pdfBuffer = await getObjectBuffer(sourceS3Key);
    const report = await analyzePrintReadiness(pdfBuffer);

    await prisma.job.update({
      where: { id: operationJobId },
      data: {
        status: 'completed',
        payload: {
          documentId,
          versionId,
          printReadiness: report,
          message: 'Проверка завершена — смотрите отчёт ниже.',
        },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Не удалось проверить PDF';
    await prisma.job.update({
      where: { id: operationJobId },
      data: { status: 'failed', payload: { error: message } },
    });
    throw err;
  }
}
