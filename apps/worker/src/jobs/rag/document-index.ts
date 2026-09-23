import { splitTextIntoChunks } from '@folio-mind/ai-contracts';
import type { PageText } from '@folio-mind/pdf-contracts';
import type { AIProviderName } from '@folio-mind/ai-providers';
import type { WorkerJobPayload } from '../../lib/config/job-types.js';
import type { WorkerEnv } from '../../lib/config/env.js';
import { getPrisma } from '../../lib/infra/prisma.js';
import { createLLMFromWorkerEnv } from '../../lib/ai/llm.js';
import { saveChunkEmbeddings } from '../../lib/rag/save-chunk-embeddings.js';
import { loadDocumentPagesForAi } from '../../lib/pdf/document-text.js';
import { getObjectBuffer, isWorkerS3Configured } from '../../lib/storage/s3.js';

type DocumentIndexPayload = WorkerJobPayload & {
  jobId?: string;
  documentId?: string;
  versionId?: string;
  tenantId?: string;
  provider?: AIProviderName;
};

type PageChunk = {
  content: string;
  page: number | null;
};

function buildPageAwareChunks(pages: PageText[]): PageChunk[] {
  const result: PageChunk[] = [];
  for (const page of pages) {
    const parts = splitTextIntoChunks(page.text, { maxChunkSize: 1000, overlap: 100 });
    for (const content of parts) {
      result.push({ content, page: page.page });
    }
  }
  return result;
}

export async function indexDocumentVersionChunks(params: {
  env: WorkerEnv;
  documentId: string;
  versionId: string;
  tenantId: string;
  pages?: PageText[];
  provider?: AIProviderName;
}): Promise<{ chunkCount: number; providerCount: number; localCount: number }> {
  const { env, documentId, versionId, tenantId, provider } = params;
  const prisma = getPrisma();

  let pages = params.pages;
  if (!pages || pages.length === 0) {
    if (!isWorkerS3Configured()) {
      throw new Error('S3 не настроен в worker');
    }
    const version = await prisma.documentVersion.findUnique({
      where: { id: versionId },
      select: { s3Key: true, pageCount: true },
    });
    if (!version?.s3Key || version.s3Key === 'pending') {
      throw new Error('Версия документа без файла в S3');
    }
    const pdfBuffer = await getObjectBuffer(version.s3Key);
    pages = await loadDocumentPagesForAi(documentId, versionId, pdfBuffer, version.pageCount);
  }

  const pageChunks = buildPageAwareChunks(pages);
  if (pageChunks.length === 0) {
    await prisma.documentChunk.deleteMany({ where: { versionId } });
    return { chunkCount: 0, providerCount: 0, localCount: 0 };
  }

  const createdRows = await prisma.$transaction(async (tx) => {
    await tx.documentChunk.deleteMany({ where: { versionId } });
    const rows: Array<{ id: string; content: string }> = [];
    for (let chunkIndex = 0; chunkIndex < pageChunks.length; chunkIndex++) {
      const item = pageChunks[chunkIndex]!;
      const row = await tx.documentChunk.create({
        data: {
          documentId,
          versionId,
          tenantId,
          chunkIndex,
          page: item.page,
          content: item.content,
        },
      });
      rows.push({ id: row.id, content: item.content });
    }
    return rows;
  });

  const llm = createLLMFromWorkerEnv(env, provider ?? env.AI_PROVIDER);
  const stats = await saveChunkEmbeddings(prisma, '"DocumentChunk"', createdRows, llm);
  return {
    chunkCount: createdRows.length,
    providerCount: stats.providerCount,
    localCount: stats.localCount,
  };
}

export async function processDocumentIndexJob(
  env: WorkerEnv,
  data: DocumentIndexPayload,
): Promise<void> {
  const prisma = getPrisma();
  const jobId = data.jobId;
  const documentId = data.documentId;
  const versionId = data.versionId;
  const tenantId = data.tenantId;
  if (!jobId || !documentId || !versionId || !tenantId) {
    throw new Error('document-index job: missing required fields');
  }
  const dbJob = await prisma.job.findUnique({ where: { id: jobId } });
  if (!dbJob) throw new Error(`Job not found: ${jobId}`);
  const jobPayload = (dbJob.payload ?? {}) as Record<string, unknown>;
  const provider =
    (jobPayload.provider as AIProviderName | undefined) ?? data.provider ?? env.AI_PROVIDER;

  await prisma.job.update({
    where: { id: jobId },
    data: { status: 'processing' },
  });

  try {
    const result = await indexDocumentVersionChunks({
      env,
      documentId,
      versionId,
      tenantId,
      provider,
    });
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'completed',
        payload: {
          ...jobPayload,
          documentId,
          versionId,
          chunkCount: result.chunkCount,
          embeddingProviderCount: result.providerCount,
          embeddingLocalCount: result.localCount,
          provider,
        },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'document-index failed';
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'failed',
        payload: { ...jobPayload, documentId, versionId, error: message },
      },
    });
    throw err;
  }
}
