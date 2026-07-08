import type { WorkerJobPayload } from '../../lib/config/job-types.js';
import type { WorkerEnv } from '../../lib/config/env.js';
import { getPrisma } from '../../lib/infra/prisma.js';
import { buildBookletExportZip, bookletZipKey } from '../../lib/pdf/booklet-export.js';
import { getObjectBuffer, isWorkerS3Configured, putObjectBuffer } from '../../lib/storage/s3.js';

type ExportBookletPayload = WorkerJobPayload & {
  operationJobId?: string;
  documentId?: string;
  versionId?: string;
  sourceS3Key?: string;
  title?: string;
  jpegDpi?: number;
  pdfA?: boolean;
};

export async function processExportBookletJob(_env: WorkerEnv, data: ExportBookletPayload): Promise<void> {
  const {
    operationJobId,
    documentId,
    versionId,
    sourceS3Key,
    title = 'booklet',
    jpegDpi = 150,
    pdfA = false,
  } = data;

  if (!operationJobId || !documentId || !versionId || !sourceS3Key) {
    throw new Error('Export booklet: missing required fields');
  }

  const prisma = getPrisma();
  await prisma.job.update({ where: { id: operationJobId }, data: { status: 'processing' } });

  try {
    if (!isWorkerS3Configured()) {
      throw new Error('S3 не настроен в worker');
    }

    const pdfBuffer = await getObjectBuffer(sourceS3Key);
    const { zipBuffer, result } = await buildBookletExportZip({
      documentId,
      versionId,
      pdfBuffer,
      jpegDpi,
      pdfA,
      title,
    });

    const zipS3Key = bookletZipKey(documentId, versionId);
    await putObjectBuffer({
      key: zipS3Key,
      body: zipBuffer,
      contentType: 'application/zip',
    });

    await prisma.job.update({
      where: { id: operationJobId },
      data: {
        status: 'completed',
        payload: {
          ...result,
          zipS3Key,
          documentId,
          versionId,
        },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Export booklet failed';
    await prisma.job.update({
      where: { id: operationJobId },
      data: { status: 'failed', payload: { error: message } },
    });
    throw err;
  }
}
