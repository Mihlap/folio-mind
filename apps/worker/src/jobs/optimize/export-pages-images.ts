import type { BookletExportImageFormat } from '@folio-mind/pdf-contracts';
import type { WorkerJobPayload } from '../../lib/config/job-types.js';
import type { WorkerEnv } from '../../lib/config/env.js';
import { getPrisma } from '../../lib/infra/prisma.js';
import { buildPagesExportZip, pagesZipKey } from '../../lib/pdf/booklet-export.js';
import { getObjectBuffer, isWorkerS3Configured, putObjectBuffer } from '../../lib/storage/s3.js';

type ExportPagesPayload = WorkerJobPayload & {
  operationJobId?: string;
  documentId?: string;
  versionId?: string;
  sourceS3Key?: string;
  pages?: number[];
  format?: BookletExportImageFormat;
  dpi?: number;
};

export async function processExportPagesJob(_env: WorkerEnv, data: ExportPagesPayload): Promise<void> {
  const {
    operationJobId,
    documentId,
    versionId,
    sourceS3Key,
    pages = [],
    format = 'jpeg',
    dpi = 150,
  } = data;

  if (!operationJobId || !documentId || !versionId || !sourceS3Key) {
    throw new Error('Export pages: missing required fields');
  }

  const prisma = getPrisma();
  await prisma.job.update({ where: { id: operationJobId }, data: { status: 'processing' } });

  try {
    if (!isWorkerS3Configured()) {
      throw new Error('S3 не настроен в worker');
    }

    const pdfBuffer = await getObjectBuffer(sourceS3Key);
    const { zipBuffer, result } = await buildPagesExportZip({
      pdfBuffer,
      pages,
      format,
      dpi,
    });

    const zipS3Key = pagesZipKey(documentId, versionId);
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
    const message = err instanceof Error ? err.message : 'Export pages failed';
    await prisma.job.update({
      where: { id: operationJobId },
      data: { status: 'failed', payload: { error: message } },
    });
    throw err;
  }
}
