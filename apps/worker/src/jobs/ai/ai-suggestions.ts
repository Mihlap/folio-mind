import { parseAiSuggestionsFromLlm } from '@folio-mind/ai-contracts';
import type { AIProviderName } from '@folio-mind/ai-providers';
import type { WorkerJobPayload } from '../../lib/config/job-types.js';
import { loadDocumentText } from '../../lib/pdf/document-text.js';
import { createLLMFromWorkerEnv } from '../../lib/ai/llm.js';
import type { WorkerEnv } from '../../lib/config/env.js';
import { getPrisma } from '../../lib/infra/prisma.js';
import { getObjectBuffer, isWorkerS3Configured } from '../../lib/storage/s3.js';

const SUGGESTIONS_SYSTEM = `Ты юридический редактор PDF-договоров.
Проанализируй текст и предложи конкретные правки рисков, формулировок и пропусков.
Ответь ТОЛЬКО одним валидным JSON-объектом, без markdown и текста до/после:
{"suggestions":[{"fragmentId":"s1","originalText":"цитата","suggestion":"вариант","reason":"почему","page":1}]}
Правила JSON: только двойные кавычки; внутри строк экранируй " как \\"; без переносов строк внутри значений; до 12 элементов; originalText — короткая дословная цитата из документа (до 300 символов).`;

type SuggestionsJobPayload = WorkerJobPayload & {
  jobId?: string;
  documentId?: string;
  versionId?: string;
  tenantId?: string;
};

export async function processAiSuggestionsJob(
  env: WorkerEnv,
  data: SuggestionsJobPayload,
): Promise<void> {
  const prisma = getPrisma();
  const jobId = data.jobId;
  const versionId = data.versionId;
  const documentId = data.documentId;
  const tenantId = data.tenantId;

  if (!jobId || !versionId || !documentId || !tenantId) {
    throw new Error('AI suggestions job: missing required fields');
  }

  const dbJob = await prisma.job.findUnique({ where: { id: jobId } });
  if (!dbJob) throw new Error(`Job not found: ${jobId}`);

  const jobPayload = (dbJob.payload ?? {}) as Record<string, unknown>;
  const provider = (jobPayload.provider as AIProviderName | undefined) ?? env.AI_PROVIDER;

  await prisma.job.update({
    where: { id: jobId },
    data: { status: 'processing' },
  });

  let rawText = '';
  try {
    const version = await prisma.documentVersion.findUnique({
      where: { id: versionId },
      select: { s3Key: true },
    });
    if (!version?.s3Key || version.s3Key === 'pending') {
      throw new Error('Версия документа без файла в S3');
    }
    if (!isWorkerS3Configured()) {
      throw new Error('S3 не настроен в worker');
    }

    const pdfBuffer = await getObjectBuffer(version.s3Key);
    const documentText = await loadDocumentText(documentId, versionId, pdfBuffer);
    if (!documentText.trim()) {
      throw new Error('В документе нет текстового слоя');
    }

    const llm = createLLMFromWorkerEnv(env, provider);
    const result = await llm.complete({
      system: SUGGESTIONS_SYSTEM,
      prompt: `Текст документа:\n\n${documentText.slice(0, 100_000)}`,
      maxTokens: 4000,
    });

    rawText = result.text ?? '';
    const items = parseAiSuggestionsFromLlm(rawText);

    await prisma.aiSuggestion.deleteMany({
      where: { documentId, versionId, status: 'pending' },
    });

    const created =
      items.length === 0
        ? []
        : await prisma.$transaction(
            items.map((item) =>
              prisma.aiSuggestion.create({
                data: {
                  documentId,
                  versionId,
                  tenantId,
                  fragmentId: item.fragmentId,
                  originalText: item.originalText,
                  suggestion: item.suggestion,
                  reason: item.reason,
                  page: item.page ?? null,
                  status: 'pending',
                },
              }),
            ),
          );

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
          suggestionCount: created.length,
          suggestionIds: created.map((s) => s.id),
        },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI suggestions failed';
    const rawSnippet = rawText
      ? rawText.slice(0, 1500)
      : undefined;
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'failed',
        payload: {
          ...jobPayload,
          documentId,
          versionId,
          error: message,
          rawText: rawSnippet,
        },
      },
    });
    throw err;
  }
}
