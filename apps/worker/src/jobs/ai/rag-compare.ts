import type { AIProviderName } from '@folio-mind/ai-providers';
import type { WorkerJobPayload } from '../../lib/config/job-types.js';
import { loadDocumentText } from '../../lib/pdf/document-text.js';
import { createLLMFromWorkerEnv } from '../../lib/ai/llm.js';
import { searchRagChunks } from '../../lib/rag/rag-search.js';
import type { WorkerEnv } from '../../lib/config/env.js';
import { getPrisma } from '../../lib/infra/prisma.js';
import { getObjectBuffer, isWorkerS3Configured } from '../../lib/storage/s3.js';
const RAG_COMPARE_SYSTEM = `Ты юридический аналитик.
Сверь договор с фрагментами внутренних регламентов и шаблонов.
Укажи расхождения, риски и рекомендации на русском языке.
Структура ответа: ## Соответствие регламенту, ## Риски, ## Рекомендации.
Не выдумывай нормы, которых нет во фрагментах регламентов.`;
const CHUNK_LIMIT = 12;
type RagComparePayload = WorkerJobPayload & {
  jobId?: string;
  documentId?: string;
  versionId?: string;
  tenantId?: string;
  query?: string;
};
async function loadRagChunksForCompare(
  prisma: ReturnType<typeof getPrisma>,
  tenantId: string,
  documentText: string,
  embed?: (text: string) => Promise<number[]>,
) {
  const readyWhere = {
    tenantId,
    source: { status: 'ready' as const },
  };
  const readyCount = await prisma.ragChunk.count({ where: readyWhere });
  if (readyCount === 0) {
    const processingSources = await prisma.ragSource.count({
      where: { tenantId, status: 'processing' },
    });
    if (processingSources > 0) {
      throw new Error(
        'Регламенты ещё обрабатываются. Подождите статус «готов к проверке» в разделе «Регламенты».',
      );
    }
    const anySources = await prisma.ragSource.count({ where: { tenantId } });
    if (anySources === 0) {
      throw new Error('Нет загруженных регламентов. Добавьте файл в разделе «Регламенты».');
    }
    throw new Error(
      'Нет готовых регламентов. Проверьте статус файлов в разделе «Регламенты» (нужен «готов к проверке»).',
    );
  }
  return searchRagChunks(prisma, tenantId, documentText, { limit: CHUNK_LIMIT, embed });
}
export async function processRagCompareJob(env: WorkerEnv, data: RagComparePayload): Promise<void> {
  const prisma = getPrisma();
  const jobId = data.jobId;
  const documentId = data.documentId;
  const versionId = data.versionId;
  const tenantId = data.tenantId;
  if (!jobId || !documentId || !versionId || !tenantId) {
    throw new Error('RAG compare job: missing required fields');
  }
  const dbJob = await prisma.job.findUnique({ where: { id: jobId } });
  if (!dbJob) throw new Error(`Job not found: ${jobId}`);
  const jobPayload = (dbJob.payload ?? {}) as Record<string, unknown>;
  const provider = (jobPayload.provider as AIProviderName | undefined) ?? env.AI_PROVIDER;
  await prisma.job.update({
    where: { id: jobId },
    data: { status: 'processing' },
  });
  try {
    const version = await prisma.documentVersion.findUnique({
      where: { id: versionId },
      select: { s3Key: true },
    });
    if (!version?.s3Key || version.s3Key === 'pending') {
      throw new Error('Версия документа без файла');
    }
    if (!isWorkerS3Configured()) {
      throw new Error('S3 не настроен');
    }
    const pdfBuffer = await getObjectBuffer(version.s3Key);
    const documentText = await loadDocumentText(documentId, versionId, pdfBuffer);
    if (!documentText.trim()) {
      throw new Error('Нет текстового слоя в документе');
    }
    const llm = createLLMFromWorkerEnv(env, provider);
    const embed = llm.embed ? (text: string) => llm.embed!(text) : undefined;
    const ragChunks = await loadRagChunksForCompare(prisma, tenantId, documentText, embed);
    const regulationsBlock = ragChunks
      .map(
        (chunk, index) =>
          `[${index + 1}] ${chunk.source.title} (фрагмент ${chunk.chunkIndex + 1}):\n${chunk.content}`,
      )
      .join('\n\n');
    const result = await llm.complete({
      system: RAG_COMPARE_SYSTEM,
      prompt: `Сверка договора с внутренними регламентами.\n\nТекст договора:\n${documentText.slice(0, 80000)}\n\nФрагменты регламентов:\n${regulationsBlock}`,
      maxTokens: 3000,
    });
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'completed',
        payload: {
          ...jobPayload,
          documentId,
          versionId,
          provider,
          model: result.model,
          report: result.text,
          ragChunkCount: ragChunks.length,
        },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'RAG compare failed';
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
