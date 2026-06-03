import { splitTextIntoChunks } from '@folio-mind/ai-contracts';
import type { WorkerJobPayload } from '../../lib/config/job-types.js';
import { extractTextFromPdf } from '../../lib/pdf/pdf-text.js';
import type { WorkerEnv } from '../../lib/config/env.js';
import { getPrisma } from '../../lib/infra/prisma.js';
import { getObjectBuffer, isWorkerS3Configured } from '../../lib/storage/s3.js';

type RagIndexPayload = WorkerJobPayload & {
  jobId?: string;
  sourceId?: string;
  tenantId?: string;
  s3Key?: string;
  fileName?: string;
};

export async function processRagIndexJob(env: WorkerEnv, data: RagIndexPayload): Promise<void> {
  const prisma = getPrisma();
  const jobId = data.jobId;
  const sourceId = data.sourceId;
  const tenantId = data.tenantId;
  const s3Key = data.s3Key;
  const fileName = data.fileName ?? '';

  if (!jobId || !sourceId || !tenantId || !s3Key) {
    throw new Error('RAG index job: missing required fields');
  }

  const dbJob = await prisma.job.findUnique({ where: { id: jobId } });
  if (!dbJob) throw new Error(`Job not found: ${jobId}`);

  await prisma.job.update({
    where: { id: jobId },
    data: { status: 'processing' },
  });

  try {
    if (!isWorkerS3Configured()) {
      throw new Error('S3 не настроен в worker');
    }

    const buffer = await getObjectBuffer(s3Key);
    const lower = fileName.toLowerCase();
    let text = '';
    if (lower.endsWith('.pdf') || buffer.subarray(0, 4).toString() === '%PDF') {
      const extracted = await extractTextFromPdf(buffer);
      text = extracted.text;
    } else {
      text = buffer.toString('utf8');
    }

    const chunks = splitTextIntoChunks(text);
    if (chunks.length === 0) {
      throw new Error('Не удалось извлечь текст для индексации');
    }

    await prisma.$transaction([
      prisma.ragChunk.deleteMany({ where: { sourceId } }),
      ...chunks.map((content, chunkIndex) =>
        prisma.ragChunk.create({
          data: { sourceId, tenantId, chunkIndex, content },
        }),
      ),
      prisma.ragSource.update({
        where: { id: sourceId },
        data: { status: 'ready', chunkCount: chunks.length },
      }),
    ]);

    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'completed',
        payload: { sourceId, chunkCount: chunks.length },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'RAG index failed';
    await prisma.ragSource.update({
      where: { id: sourceId },
      data: { status: 'failed' },
    });
    await prisma.job.update({
      where: { id: jobId },
      data: { status: 'failed', payload: { sourceId, error: message } },
    });
    throw err;
  }
}
