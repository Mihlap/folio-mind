import {
  AI_SUGGESTIONS_USER_ERROR,
  parseAiSuggestionsFromLlm,
  toUserFacingAiSuggestionsError,
  type AiSuggestionItem,
} from '@folio-mind/ai-contracts';
import type { AIProviderName, LLMProvider } from '@folio-mind/ai-providers';
import type { PageText } from '@folio-mind/pdf-contracts';
import type { WorkerJobPayload } from '../../lib/config/job-types.js';
import {
  formatPagesForAiPrompt,
  loadDocumentPagesForAi,
  resolveAiSuggestionsPages,
  type AiSuggestionsScope,
} from '../../lib/pdf/document-text.js';
import { createLLMFromWorkerEnv } from '../../lib/ai/llm.js';
import { findBestVerbatimQuote } from '../../lib/pdf/quote-verify.js';
import type { WorkerEnv } from '../../lib/config/env.js';
import { getPrisma } from '../../lib/infra/prisma.js';
import { getObjectBuffer, isWorkerS3Configured } from '../../lib/storage/s3.js';

const SUGGESTIONS_SYSTEM = `Ты юридический редактор PDF-договоров.
Проанализируй текст и предложи конкретные правки рисков, формулировок и пропусков.
Ответь ТОЛЬКО одним валидным JSON-объектом, без markdown и текста до/после:
{"suggestions":[{"fragmentId":"s1","originalText":"цитата","suggestion":"вариант","reason":"почему","page":2}]}
Правила JSON: только двойные кавычки; внутри строк экранируй " как \\"; без переносов строк внутри значений; originalText — короткая дословная цитата из документа (до 300 символов).
В поле page указывай номер страницы из маркеров «--- Страница N ---».`;

function buildSystemPrompt(maxItems: number): string {
  return `${SUGGESTIONS_SYSTEM}\nНе больше ${maxItems} элементов в массиве suggestions.`;
}

function buildResultHint(
  scope: AiSuggestionsScope,
  targetPage: number | undefined,
  count: number,
): string {
  if (count > 0) {
    if (scope === 'page' && targetPage) {
      return `Готово: ${count} предложений по странице ${targetPage}. Смотрите блок «Новые предложения» ниже.`;
    }
    return `Готово: ${count} предложений. Смотрите блок «Новые предложения» ниже.`;
  }
  if (scope === 'page' && targetPage) {
    return `На странице ${targetPage} ИИ не нашёл замечаний. Попробуйте «Весь документ» или другую страницу.`;
  }
  return 'ИИ не нашёл замечаний по документу.';
}

function buildPageScopeSystemPrompt(maxItems: number): string {
  return `${buildSystemPrompt(maxItems)}
Если явных юридических рисков нет, предложи улучшения ясности, стиля и единообразия формулировок по тексту этой страницы.`;
}

type SuggestionsJobPayload = WorkerJobPayload & {
  jobId?: string;
  documentId?: string;
  versionId?: string;
  tenantId?: string;
};

function readSuggestionsScope(payload: Record<string, unknown>): AiSuggestionsScope {
  return payload.scope === 'page' ? 'page' : 'document';
}

function readSuggestionsPage(payload: Record<string, unknown>): number | undefined {
  const page = payload.page;
  return typeof page === 'number' && Number.isInteger(page) && page >= 1 ? page : undefined;
}

function dedupeSuggestions(items: AiSuggestionItem[]): AiSuggestionItem[] {
  const seen = new Set<string>();
  const out: AiSuggestionItem[] = [];
  for (const item of items) {
    const key = `${item.page ?? 0}:${item.originalText.slice(0, 120)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/** Подтверждает «было» дословным совпадением с текстом PDF, заменяя цитату на фактический текст. */
function verifyQuotes(items: AiSuggestionItem[], pages: PageText[]): AiSuggestionItem[] {
  return items.map((item) => {
    const result = findBestVerbatimQuote(pages, item.originalText);
    return {
      ...item,
      originalText: result.verbatim,
      quoteMatched: result.matched,
      page: result.matched && result.page ? result.page : item.page,
    };
  });
}

async function completeAndParseSuggestions(
  llm: LLMProvider,
  system: string,
  prompt: string,
): Promise<{ text: string; items: AiSuggestionItem[]; model: string }> {
  let lastText = '';
  let model = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const userPrompt =
      attempt === 0
        ? prompt
        : `${prompt}\n\nВАЖНО: предыдущий ответ не был валидным JSON. Верни ТОЛЬКО один JSON-объект {"suggestions":[...]} без markdown и пояснений.`;
    const result = await llm.complete({
      system,
      prompt: userPrompt,
      maxTokens: 6000,
    });
    lastText = result.text ?? '';
    model = result.model;
    try {
      return { text: lastText, items: parseAiSuggestionsFromLlm(lastText), model };
    } catch (err) {
      if (attempt === 1) throw err;
    }
  }
  throw new Error(AI_SUGGESTIONS_USER_ERROR.invalidFormat);
}

async function collectSuggestionsForPages(
  llm: LLMProvider,
  pages: PageText[],
  scope: AiSuggestionsScope,
  targetPage?: number,
): Promise<{ items: AiSuggestionItem[]; model: string; rawText: string }> {
  if (scope === 'page' || pages.length === 1) {
    const scopeLabel =
      scope === 'page' && targetPage
        ? `Только страница ${targetPage}.`
        : 'Текст одной страницы ниже.';
    const documentText = formatPagesForAiPrompt(pages);
    const result = await completeAndParseSuggestions(
      llm,
      scope === 'page' ? buildPageScopeSystemPrompt(12) : buildSystemPrompt(12),
      `${scopeLabel}\n\nТекст:\n\n${documentText}`,
    );
    const items = verifyQuotes(
      result.items.map((item) => ({
        ...item,
        page: scope === 'page' && targetPage ? targetPage : (item.page ?? pages[0]?.page ?? undefined),
      })),
      pages,
    );
    return { items, model: result.model, rawText: result.text };
  }

  const nonEmptyPages = pages.filter((p) => p.text.trim().length > 0);
  if (nonEmptyPages.length === 0) {
    throw new Error('В документе нет текста для анализа');
  }

  const merged: AiSuggestionItem[] = [];
  let model = '';
  let rawText = '';
  let pagesAttempted = 0;
  let pagesFailed = 0;
  let lastError: Error | null = null;

  for (const page of nonEmptyPages) {
    pagesAttempted += 1;
    const pageText = formatPagesForAiPrompt([page]);
    try {
      const result = await completeAndParseSuggestions(
        llm,
        buildPageScopeSystemPrompt(4),
        `Только страница ${page.page}.\n\nТекст:\n\n${pageText}`,
      );
      model = result.model;
      rawText = result.text;
      merged.push(
        ...result.items.map((item) => ({
          ...item,
          page: item.page ?? page.page,
        })),
      );
    } catch (err) {
      pagesFailed += 1;
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn('[ai-suggestions] page analysis failed', {
        page: page.page,
        error: lastError.message,
      });
    }
  }

  const items = verifyQuotes(dedupeSuggestions(merged).slice(0, 30), pages);
  if (items.length === 0 && pagesFailed > 0 && pagesFailed === pagesAttempted && lastError) {
    throw lastError;
  }
  return { items, model, rawText };
}

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
  const scope = readSuggestionsScope(jobPayload);
  const targetPage = readSuggestionsPage(jobPayload);
  await prisma.job.update({
    where: { id: jobId },
    data: { status: 'processing' },
  });
  let rawText = '';
  try {
    const version = await prisma.documentVersion.findUnique({
      where: { id: versionId },
      select: { s3Key: true, pageCount: true },
    });
    if (!version?.s3Key || version.s3Key === 'pending') {
      throw new Error('Версия документа без файла в S3');
    }
    if (!isWorkerS3Configured()) {
      throw new Error('S3 не настроен в worker');
    }
    const pdfBuffer = await getObjectBuffer(version.s3Key);
    const allPages = await loadDocumentPagesForAi(
      documentId,
      versionId,
      pdfBuffer,
      version.pageCount,
    );
    const pages = await resolveAiSuggestionsPages(
      allPages,
      scope,
      targetPage,
      pdfBuffer,
    );
    if (pages.length === 0 || !formatPagesForAiPrompt(pages).trim()) {
      throw new Error('В документе нет текстового слоя');
    }
    const llm = createLLMFromWorkerEnv(env, provider);
    const { items, model, rawText: llmRawText } = await collectSuggestionsForPages(
      llm,
      pages,
      scope,
      targetPage,
    );
    rawText = llmRawText;
    await prisma.aiSuggestion.deleteMany({
      where:
        scope === 'page' && targetPage
          ? { documentId, versionId, status: 'pending', page: targetPage }
          : { documentId, versionId, status: 'pending' },
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
                  quoteMatched: item.quoteMatched ?? true,
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
          scope,
          page: scope === 'page' ? targetPage : undefined,
          model,
          suggestionCount: created.length,
          suggestionIds: created.map((s) => s.id),
          analyzedPageCount: pages.length,
          resultHint: buildResultHint(scope, targetPage, created.length),
        },
      },
    });
  } catch (err) {
    const errorDetail = err instanceof Error ? err.message : 'AI suggestions failed';
    const message = toUserFacingAiSuggestionsError(err);
    const rawSnippet = rawText ? rawText.slice(0, 1500) : undefined;
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'failed',
        payload: {
          ...jobPayload,
          documentId,
          versionId,
          error: message,
          errorDetail,
          rawText: rawSnippet,
        },
      },
    });
    throw err;
  }
}
