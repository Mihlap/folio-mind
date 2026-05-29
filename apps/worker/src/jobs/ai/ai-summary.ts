import type { AIProviderName } from '@folio-mind/ai-providers';
import type { WorkerJobPayload } from '../../lib/config/job-types.js';
import { summarizePdfWithoutTextLayer } from '../../lib/ai/ai-document.js';
import { loadDocumentText } from '../../lib/pdf/document-text.js';
import { createLLMFromWorkerEnv } from '../../lib/ai/llm.js';
import type { WorkerEnv } from '../../lib/config/env.js';
import { getCachedSummary, setCachedSummary } from '../../lib/infra/redis.js';
import { getPrisma } from '../../lib/infra/prisma.js';
import { getObjectBuffer, isWorkerS3Configured } from '../../lib/storage/s3.js';

const SUMMARY_SYSTEM = `Ты помощник по анализу PDF-документов.
Сделай краткий пересказ на русском языке: суть, ключевые разделы, важные даты и суммы (если есть).
Не выдумывай факты, которых нет в документе. 5–10 предложений.`;

const SUMMARY_PDF_PROMPT =
  'Сделай краткий пересказ приложенного PDF-документа на русском языке (5–10 предложений).';

type SummaryJobPayload = WorkerJobPayload & {
  jobId?: string;
  documentId?: string;
  versionId?: string;
  tenantId?: string;
};

export async function processAiSummaryJob(env: WorkerEnv, data: SummaryJobPayload): Promise<void> {
  const prisma = getPrisma();
  const jobId = data.jobId;
  const versionId = data.versionId;
  const documentId = data.documentId;

  if (!jobId || !versionId || !documentId) {
    throw new Error('AI summary job: missing jobId, versionId or documentId');
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
    const cached = await getCachedSummary(env.REDIS_URL, versionId);
    if (cached) {
      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: 'completed',
          payload: {
            ...jobPayload,
            documentId,
            versionId,
            provider: cached.provider,
            model: cached.model,
            summary: cached.summary,
            cached: true,
          },
        },
      });
      return;
    }

    const version = await prisma.documentVersion.findUnique({
      where: { id: versionId },
      select: { s3Key: true, mimeType: true },
    });
    if (!version?.s3Key || version.s3Key === 'pending') {
      throw new Error('Версия документа без файла в S3');
    }
    if (!isWorkerS3Configured()) {
      throw new Error('S3 не настроен в worker (.env)');
    }

    const pdfBuffer = await getObjectBuffer(version.s3Key);
    const documentText = await loadDocumentText(documentId, versionId, pdfBuffer);
    const llm = createLLMFromWorkerEnv(env, provider);

    const result = documentText.trim()
      ? await llm.complete({
          system: SUMMARY_SYSTEM,
          prompt: `Текст документа:\n\n${documentText}`,
          maxTokens: 1500,
        })
      : await summarizePdfWithoutTextLayer(
          llm,
          provider,
          pdfBuffer,
          documentId,
          SUMMARY_SYSTEM,
          SUMMARY_PDF_PROMPT,
        );

    const summaryPayload = {
      ...jobPayload,
      documentId,
      versionId,
      provider,
      model: result.model,
      summary: result.text,
      cached: false,
    };

    await setCachedSummary(env.REDIS_URL, versionId, {
      summary: result.text,
      model: result.model,
      provider,
    });

    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'completed',
        payload: summaryPayload,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI summary failed';
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'failed',
        payload: {
          ...jobPayload,
          documentId,
          versionId,
          error: message,
        },
      },
    });
    throw err;
  }
}
