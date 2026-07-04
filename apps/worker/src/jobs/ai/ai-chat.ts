import type { AIProviderName } from '@folio-mind/ai-providers';
import type { WorkerJobPayload } from '../../lib/config/job-types.js';
import { loadDocumentText } from '../../lib/pdf/document-text.js';
import { createLLMFromWorkerEnv } from '../../lib/ai/llm.js';
import type { WorkerEnv } from '../../lib/config/env.js';
import { getPrisma } from '../../lib/infra/prisma.js';
import { getObjectBuffer, isWorkerS3Configured } from '../../lib/storage/s3.js';
import { loadUserGuideText } from '../../lib/help/load-user-guide.js';

const CHAT_SYSTEM = `Ты помощник в сервисе РазУм для работы с PDF-документами.
Отвечай на русском языке, просто и по шагам.

Источники ответа (по приоритету):
1) Вопросы о содержании PDF — только по тексту документа ниже.
2) Вопросы о том, как пользоваться РазУм (макет, шаблоны бюро, медиатека, проекты, гостевая ссылка, сжатие PDF, ИИ и т.д.) — по блоку «Справка по приложению».
3) Если ответа нет ни в документе, ни в справке — честно скажи об этом. Не выдумывай факты и кнопки, которых нет в справке.`;
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
    let documentText = '';
    try {
      documentText = await loadDocumentText(documentId, versionId, pdfBuffer);
    } catch {
      documentText = '';
    }
    const userGuide = loadUserGuideText();
    const llm = createLLMFromWorkerEnv(env, provider);
    const historyBlock =
      history.length > 0
        ? `\n\nИстория диалога:\n${history.map((m) => `${m.role === 'user' ? 'Пользователь' : 'Ассистент'}: ${m.content}`).join('\n')}`
        : '';
    const documentBlock = documentText.trim()
      ? `\n\nТекст документа (PDF):\n\n${documentText.slice(0, 120_000)}`
      : '\n\nТекст документа (PDF): [нет текстового слоя или текст не извлечён — отвечай по справке, если вопрос про приложение]';
    const result = await llm.complete({
      system: CHAT_SYSTEM,
      prompt: `Справка по приложению РазУм:\n\n${userGuide}${documentBlock}${historyBlock}\n\nВопрос пользователя:\n${prompt}`,
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
