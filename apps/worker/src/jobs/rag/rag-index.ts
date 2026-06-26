import {
  splitTextIntoChunks,
  embedTextLocal,
  embeddingToPgVector,
  RAG_EMBEDDING_DIM,
} from '@folio-mind/ai-contracts';
import { createLLMProvider, type AIProviderName } from '@folio-mind/ai-providers';
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
  provider?: AIProviderName;
};
async function saveChunkEmbeddings(
  prisma: ReturnType<typeof getPrisma>,
  rows: Array<{
    id: string;
    content: string;
  }>,
  provider?: AIProviderName,
): Promise<void> {
  let providerInstance: ReturnType<typeof createLLMProvider> | null = null;
  if (provider) {
    try {
      providerInstance = createLLMProvider(provider, {
        gigachat: {
          credentials: process.env.GIGACHAT_CREDENTIALS ?? '',
          embeddingModel: process.env.GIGACHAT_EMBEDDING_MODEL,
        },
        yandex: {
          folderId: process.env.YANDEX_FOLDER_ID ?? '',
          iamToken: process.env.YANDEX_IAM_TOKEN ?? '',
          embeddingModel: process.env.YANDEX_EMBEDDING_MODEL,
        },
      });
      await providerInstance.healthCheck();
    } catch {
      providerInstance = null;
    }
  }
  for (const row of rows) {
    let vector: number[];
    if (providerInstance?.embed) {
      try {
        vector = await providerInstance.embed(row.content);
        if (vector.length !== RAG_EMBEDDING_DIM) {
          console.warn(
            `[rag-index] provider embedding dim ${vector.length} != ${RAG_EMBEDDING_DIM}, falling back to local`,
          );
          vector = embedTextLocal(row.content);
        }
      } catch (err) {
        console.warn('[rag-index] provider embedding failed, falling back to local', err);
        vector = embedTextLocal(row.content);
      }
    } else {
      vector = embedTextLocal(row.content);
    }
    const vectorLiteral = embeddingToPgVector(vector);
    await prisma.$executeRawUnsafe(
      `UPDATE "RagChunk" SET embedding = $1::vector WHERE id = $2`,
      vectorLiteral,
      row.id,
    );
  }
}
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
    const createdRows = await prisma.$transaction(async (tx) => {
      await tx.ragChunk.deleteMany({ where: { sourceId } });
      const rows: Array<{
        id: string;
        content: string;
      }> = [];
      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        const content = chunks[chunkIndex]!;
        const row = await tx.ragChunk.create({
          data: { sourceId, tenantId, chunkIndex, content },
        });
        rows.push({ id: row.id, content });
      }
      await tx.ragSource.update({
        where: { id: sourceId },
        data: { status: 'ready', chunkCount: chunks.length },
      });
      return rows;
    });
    try {
      await saveChunkEmbeddings(prisma, createdRows);
    } catch (embedErr) {
      console.warn('[rag-index] embedding save failed, chunks kept without vectors', embedErr);
    }
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'completed',
        payload: { sourceId, chunkCount: chunks.length, embeddings: true },
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
