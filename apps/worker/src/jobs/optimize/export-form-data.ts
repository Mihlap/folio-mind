import type { WorkerJobPayload } from '../../lib/config/job-types.js';
import type { WorkerEnv } from '../../lib/config/env.js';
import { extractAcroFormFields, formFieldsToCsv } from '../../lib/pdf/acroform.js';
import { getPrisma } from '../../lib/infra/prisma.js';
import { resolveS3Key } from '@folio-mind/pdf-contracts';
import { getObjectBuffer, isWorkerS3Configured, putObjectBuffer } from '../../lib/storage/s3.js';
import { failOptimizeOperation } from '../../lib/pdf/finalize-optimize-version.js';

type Payload = WorkerJobPayload & {
  operationJobId?: string;
  documentId?: string;
  versionId?: string;
  sourceS3Key?: string;
  format?: 'json' | 'csv';
};

export async function processExportFormDataJob(env: WorkerEnv, data: Payload): Promise<void> {
  const { operationJobId, documentId, versionId, sourceS3Key, format = 'json' } = data;
  if (!operationJobId || !documentId || !versionId || !sourceS3Key) {
    throw new Error('export-form-data: missing fields');
  }
  const prisma = getPrisma();
  await prisma.job.update({ where: { id: operationJobId }, data: { status: 'processing' } });
  try {
    if (!isWorkerS3Configured()) throw new Error('S3 не настроен');
    const pdfBuffer = await getObjectBuffer(sourceS3Key);
    const fields = await extractAcroFormFields(pdfBuffer);
    const jsonKey = resolveS3Key('exports', `${documentId}/${versionId}/form-data.json`);
    const body =
      format === 'csv'
        ? Buffer.from(formFieldsToCsv(fields), 'utf8')
        : Buffer.from(JSON.stringify({ fields, exportedAt: new Date().toISOString() }, null, 2), 'utf8');
    const key =
      format === 'csv'
        ? resolveS3Key('exports', `${documentId}/${versionId}/form-data.csv`)
        : jsonKey;
    await putObjectBuffer({
      key,
      body,
      contentType: format === 'csv' ? 'text/csv' : 'application/json',
    });
    await prisma.job.update({
      where: { id: operationJobId },
      data: {
        status: 'completed',
        payload: { documentId, versionId, exportKey: key, fieldCount: fields.length, format },
      },
    });
    if (data.tenantId) {
      const { dispatchTenantWebhooks } = await import('../../lib/webhooks/dispatch.js');
      await dispatchTenantWebhooks(prisma, {
        tenantId: data.tenantId,
        event: 'job.completed',
        payload: { jobId: operationJobId, type: 'export-form-data', documentId, versionId },
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'export-form-data failed';
    await failOptimizeOperation({
      operationJobId,
      targetVersionId: versionId,
      error: message,
      payload: { documentId, versionId },
    });
    throw err;
  }
}
