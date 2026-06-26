import type { AIProviderName } from '@folio-mind/ai-providers';
import type { WorkerJobPayload } from '../../lib/config/job-types.js';
import { loadDocumentText } from '../../lib/pdf/document-text.js';
import { createLLMFromWorkerEnv } from '../../lib/ai/llm.js';
import type { WorkerEnv } from '../../lib/config/env.js';
import { getPrisma } from '../../lib/infra/prisma.js';
import { getObjectBuffer, isWorkerS3Configured } from '../../lib/storage/s3.js';
const CHAT_SYSTEM = `Ты помощник по анализу PDF-документов.
Отвечай на русском языке, опираясь только на текст документа и историю диалога.
Если ответа нет в документе — так и скажи. Не выдумывай факты.`;
type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};
type ChatJobPayload = WorkerJobPayload & {
  jobId?: string;
  documentId?: string;
  versionId?: string;
  prompt?: string;
  history?: ChatMessage[];
};
export async function processAiChatJob(env: WorkerEnv, data: ChatJobPayload): Promise<void> {
  const prisma = getPrisma();
  const jobId = data.jobId;
  const versionId = data.versionId;
  const documentId = data.documentId;
  const prompt = data.prompt?.trim();
  if (!jobId || !versionId || !documentId || !prompt) {
    throw new Error('AI chat job: missing jobId, versionId, documentId or prompt');
  }
  const dbJob = await prisma.job.findUnique({ where: { id: jobId } });
  if (!dbJob) throw new Error(`Job not found: ${jobId}`);
  const jobPayload = (dbJob.payload ?? {}) as Record<string, unknown>;
  const provider = (jobPayload.provider as AIProviderName | undefined) ?? env.AI_PROVIDER;
  const history = (jobPayload.history as ChatMessage[] | undefined) ?? [];
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
      throw new Error('Версия документа без файла в S3');
    }
    if (!isWorkerS3Configured()) {
      throw new Error('S3 не настроен в worker (.env)');
    }
    const pdfBuffer = await getObjectBuffer(version.s3Key);
    const documentText = await loadDocumentText(documentId, versionId, pdfBuffer);
    if (!documentText.trim()) {
      throw new Error('В документе нет текстового слоя для чата');
    }
    const llm = createLLMFromWorkerEnv(env, provider);
    const historyBlock =
      history.length > 0
        ? `\n\nИстория диалога:\n${history.map((m) => `${m.role === 'user' ? 'Пользователь' : 'Ассистент'}: ${m.content}`).join('\n')}`
        : '';
    const result = await llm.complete({
      system: CHAT_SYSTEM,
      prompt: `Текст документа:\n\n${documentText.slice(0, 120000)}${historyBlock}\n\nВопрос пользователя:\n${prompt}`,
      maxTokens: 2000,
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
          prompt,
          reply: result.text,
        },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI chat failed';
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'failed',
        payload: {
          ...jobPayload,
          documentId,
          versionId,
          prompt,
          error: message,
        },
      },
    });
    throw err;
  }
}
