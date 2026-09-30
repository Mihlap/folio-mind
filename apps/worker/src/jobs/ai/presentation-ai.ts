import type { AIProviderName } from '@folio-mind/ai-providers';
import {
  PRESENTATION_SLIDE_DEFAULT_LAYOUT,
  isPresentationSlideLayout,
  parsePresentationAiDraft,
  type PresentationAiDraft,
  type PresentationAiMode,
  type PresentationAiSlideDraft,
} from '@folio-mind/pdf-contracts';
import type { WorkerJobPayload } from '../../lib/config/job-types.js';
import type { WorkerEnv } from '../../lib/config/env.js';
import { createLLMFromWorkerEnv } from '../../lib/ai/llm.js';
import { getPrisma } from '../../lib/infra/prisma.js';
import {
  formatPagesForAiPrompt,
  loadDocumentPagesForAi,
} from '../../lib/pdf/document-text.js';
import { getObjectBuffer, isWorkerS3Configured } from '../../lib/storage/s3.js';

type PresentationAiPayload = WorkerJobPayload & {
  jobId?: string;
  documentId?: string;
  versionId?: string;
  tenantId?: string;
  mode?: string;
};

const AI_MODES: PresentationAiMode[] = ['advise', 'assemble', 'author'];

const DRAFT_SCHEMA_HINT = `Верни ТОЛЬКО один JSON-объект без markdown и текста до/после:
{"title":"...","subtitle":"...","slides":[{"sourcePage":5,"mediaAssetId":null,"layoutVariant":"image_top","title":"...","subtitle":"...","body":["тезис 1","тезис 2","тезис 3"]}]}
Правила:
- title презентации — до 180 символов, subtitle — до 280 символов.
- каждый слайд: title до 200 символов, subtitle до 300, body — массив из 3–6 коротких тезисов-строк, каждая до 260 символов.
- только строки без markdown-разметки (без **, ##, списков-маркеров).
- Двойные кавычки внутри значений экранируй как \\".`;

const ASSEMBLE_SYSTEM = `Ты архитектор презентаций для архитектурного бюро.
По тексту документа собери каркас презентации 16:9 о проекте.
Структура: первый слайд — титульный (layoutVariant "section" или "title_only", без sourcePage/mediaAssetId, subtitle — тип материала «архитектурная презентация»), затем 5–12 содержательных слайдов.
Для содержательных слайдов sourcePage — номер страницы из текста с маркерами «--- Страница N ---»; используй разные страницы, не больше одного слайда на страницу.
layoutVariant для содержательных — "image_right" или "image_top", mediaAssetId всегда null (используется сама страница).
В body — короткие тезисы по фактам из текста, без выдумок.
${DRAFT_SCHEMA_HINT}`;

const ADVISE_SYSTEM = `Ты редактор архитектурных презентаций.
Дан готовый план слайдов и текст документа. Улучши каждый слайд: точнее заголовок, уместный подзаголовок, осмысленные тезисы, подходящий layoutVariant.
НЕ меняй количество слайдов и НЕ меняй sourcePage/mediaAssetId (JSON-поле sourcePage обязано совпадать с исходным).
title/subtitle презентации сделай продуманными по документу.
${DRAFT_SCHEMA_HINT}`;

const AUTHOR_SYSTEM = `Ты автор архитектурных презентаций.
Напиши презентацию по тексту документа с привлечением файлов из медиатеки.
Структура: титульный слайд → 5–12 содержательных → итоговый слайд-резюме.
Для каждого содержательного слайда выбери: либо страницу документа (sourcePage — номер из маркеров «--- Страница N ---», mediaAssetId null, layout "image_right"/"image_top"), либо файл из медиатеки (mediaAssetId — id из списка, sourcePage null, layout "image_right"/"image_top"). Для итогового слайда — "title_only" или "section" без изображения.
Подбирай медиа по названию файла и заголовку; не используй id вне списка медиатеки.
В body — тезисы по сути из текста.
${DRAFT_SCHEMA_HINT}`;

function readMode(payload: Record<string, unknown>, data: PresentationAiPayload): PresentationAiMode {
  const raw = payload.mode ?? data.mode;
  return AI_MODES.includes(raw as PresentationAiMode) ? (raw as PresentationAiMode) : 'assemble';
}

function toReadableError(err: unknown): string {
  const anyErr = err as { response?: { status?: number; data?: unknown }; message?: unknown };
  if (anyErr?.response) {
    const status = anyErr.response.status ?? '?';
    const data = anyErr.response.data;
    const body =
      typeof data === 'string'
        ? data
        : data == null
          ? ''
          : JSON.stringify(data);
    return `ИИ-провайдер ответил HTTP ${status}${body ? `: ${body.slice(0, 300)}` : ''}`;
  }
  if (err instanceof Error && err.message && err.message !== '[object Object]') {
    return err.message;
  }
  return 'Ошибка ИИ-провайдера (подробности в логах worker)';
}

function sanitizeSlides(
  slides: PresentationAiSlideDraft[],
  pageCount: number,
  allowedMediaIds: Set<string>,
  mode: PresentationAiMode,
): PresentationAiSlideDraft[] {
  const maxSlides = Math.max(2, Math.min(16, pageCount > 0 ? pageCount + 2 : 16));
  return slides.slice(0, maxSlides).map((slide) => {
    const isSourceValid =
      typeof slide.sourcePage === 'number' &&
      Number.isInteger(slide.sourcePage) &&
      slide.sourcePage >= 1 &&
      slide.sourcePage <= pageCount;
    const sourcePage = isSourceValid ? slide.sourcePage : null;
    const mediaHot = slide.mediaAssetId && allowedMediaIds.has(slide.mediaAssetId)
      ? slide.mediaAssetId
      : null;
    let layoutVariant = isPresentationSlideLayout(slide.layoutVariant)
      ? slide.layoutVariant
      : PRESENTATION_SLIDE_DEFAULT_LAYOUT;
    if (mode === 'assemble' && sourcePage !== null && !mediaHot) {
      if (layoutVariant === 'title_only' || layoutVariant === 'section') {
        layoutVariant = PRESENTATION_SLIDE_DEFAULT_LAYOUT;
      }
    }
    if (mediaHot && !sourcePage && (layoutVariant === 'title_only' || layoutVariant === 'section')) {
      layoutVariant = PRESENTATION_SLIDE_DEFAULT_LAYOUT;
    }
    return {
      sourcePage,
      mediaAssetId: mediaHot,
      layoutVariant,
      title: typeof slide.title === 'string' ? slide.title.trim().slice(0, 200) || null : null,
      subtitle: typeof slide.subtitle === 'string' ? slide.subtitle.trim().slice(0, 300) || null : null,
      body: typeof slide.body === 'string' ? slide.body.trim().slice(0, 2000) || null : null,
    };
  });
}

function formatExistingSlidesPlan(
  slides: Array<{ sourcePage: number | null; mediaAssetId: string | null; layoutVariant: string; title: string | null; subtitle: string | null; body: string | null }>,
): string {
  return slides
    .map(
      (slide, index) =>
        `${index + 1}. page=${slide.sourcePage ?? '—'} media=${slide.mediaAssetId ?? '—'} layout=${slide.layoutVariant}\n` +
        `   title=${slide.title ?? '—'}\n` +
        `   subtitle=${slide.subtitle ?? '—'}\n` +
        `   body=${slide.body ?? '—'}`,
    )
    .join('\n');
}

const TRANSIENT_RETRY_DELAYS = [10_000, 20_000, 45_000];

async function completeWithTransientRetry(
  env: WorkerEnv,
  provider: AIProviderName,
  system: string,
  prompt: string,
  maxTokens: number,
): Promise<{ text: string; model: string }> {
  const llm = createLLMFromWorkerEnv(env, provider);
  for (let attempt = 0; attempt <= TRANSIENT_RETRY_DELAYS.length; attempt++) {
    try {
      const result = await llm.complete({ system, prompt, maxTokens });
      return { text: result.text ?? '', model: result.model };
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const isTransient = status === 429 || (status != null && status >= 500);
      if (!isTransient || attempt === TRANSIENT_RETRY_DELAYS.length) throw err;
      const waitMs = TRANSIENT_RETRY_DELAYS[attempt]!;
      console.log(`[presentation-ai] провайдер вернул ${status}, повтор через ${waitMs / 1000}с`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  throw new Error('unreachable');
}

async function completeAndParseDraft(
  env: WorkerEnv,
  provider: AIProviderName,
  mode: PresentationAiMode,
  prompt: string,
): Promise<{ draft: PresentationAiDraft; model: string }> {
  const system =
    mode === 'advise' ? ADVISE_SYSTEM : mode === 'author' ? AUTHOR_SYSTEM : ASSEMBLE_SYSTEM;
  let lastText = '';
  let model = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const userPrompt =
      attempt === 0
        ? prompt
        : `${prompt}\n\nВАЖНО: предыдущий ответ не был валидным JSON. Верни ровно один JSON-объект с полями title, subtitle, slides, без code-блоков и без текста вокруг.`;
    const result = await completeWithTransientRetry(env, provider, system, userPrompt, 6000);
    lastText = result.text;
    model = result.model;
    const draft = parsePresentationAiDraft(lastText);
    if (draft && draft.slides.length > 0) return { draft, model };
    if (attempt === 1) break;
  }
  const parsed = parsePresentationAiDraft(lastText);
  if (parsed) return { draft: parsed, model };
  throw new Error('Модель вернула ответ не в формате JSON');
}

export async function processPresentationAiJob(env: WorkerEnv, data: PresentationAiPayload): Promise<void> {
  const prisma = getPrisma();
  const jobId = data.jobId;
  const documentId = data.documentId;
  const versionId = data.versionId;
  const tenantId = data.tenantId;
  if (!jobId || !documentId || !versionId || !tenantId) {
    throw new Error('presentation-ai job: missing required fields');
  }

  const dbJob = await prisma.job.findUnique({ where: { id: jobId } });
  if (!dbJob) throw new Error(`Job not found: ${jobId}`);
  const jobPayload = (dbJob.payload ?? {}) as Record<string, unknown>;
  const mode = readMode(jobPayload, data);
  const provider = (jobPayload.provider as AIProviderName | undefined) ?? env.AI_PROVIDER;

  await prisma.job.update({ where: { id: jobId }, data: { status: 'processing' } });

  try {
    if (!isWorkerS3Configured()) {
      throw new Error('S3 не настроен в worker');
    }
    const version = await prisma.documentVersion.findUnique({
      where: { id: versionId },
      select: { s3Key: true, pageCount: true },
    });
    if (!version?.s3Key || version.s3Key === 'pending') {
      throw new Error('Версия документа без файла');
    }
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: { title: true },
    });

    const pdfBuffer = await getObjectBuffer(version.s3Key);
    const pages = await loadDocumentPagesForAi(
      documentId,
      versionId,
      pdfBuffer,
      version.pageCount,
    );
    const pageCount = version.pageCount && version.pageCount > 0 ? version.pageCount : pages.length;
    const documentText = formatPagesForAiPrompt(pages).trim();
    if (!documentText) {
      throw new Error(
        'Нет текста для анализа. Для сканов дождитесь распознавания или используйте GigaChat.',
      );
    }

    const presentation = await prisma.presentation.findFirst({
      where: { versionId, tenantId },
      include: { slides: { orderBy: { position: 'asc' } } },
    });
    const existingSlides = presentation?.slides ?? [];

    const mediaAssets = await prisma.mediaAsset.findMany({
      where: { tenantId, documentId },
      select: { id: true, title: true, fileName: true },
      orderBy: { updatedAt: 'desc' },
      take: 60,
    });
    const allowedMediaIds = new Set(mediaAssets.map((asset) => asset.id));

    if (mode === 'advise' && existingSlides.length === 0) {
      throw new Error('Сначала добавьте хотя бы один слайд вручную — режим «Совет» улучшает готовые слайды.');
    }

    const mediaListText = mediaAssets
      .map((asset) => `${asset.id}: ${asset.title || 'без названия'}${asset.fileName ? ` (${asset.fileName})` : ''}`)
      .join('\n');

    const prompt =
      mode === 'advise'
        ? `Название документа: ${document?.title ?? ''}\n\nТекущий план презентации:\n${formatExistingSlidesPlan(existingSlides)}\n\nТекст документа:\n${documentText.slice(0, 120_000)}`
        : mode === 'author'
          ? `Название документа: ${document?.title ?? ''}\nМедиатека документа (id: название):\n${mediaListText || '—'}\n\nТекст документа:\n${documentText.slice(0, 120_000)}`
          : `Название документа: ${document?.title ?? ''}\nВсего страниц: ${pageCount}\n\nТекст документа:\n${documentText.slice(0, 120_000)}`;

    const { draft, model } = await completeAndParseDraft(env, provider, mode, prompt);

    const sanitized = sanitizeSlides(draft.slides, pageCount, allowedMediaIds, mode);

    let slides: PresentationAiSlideDraft[];
    if (mode === 'advise') {
      slides = existingSlides.map((slide, index) => {
        const advised = sanitized[index];
        const layout = advised
          ? (isPresentationSlideLayout(advised.layoutVariant)
              ? advised.layoutVariant
              : PRESENTATION_SLIDE_DEFAULT_LAYOUT)
          : PRESENTATION_SLIDE_DEFAULT_LAYOUT;
        return {
          sourcePage: slide.sourcePage,
          mediaAssetId: slide.mediaAssetId,
          layoutVariant: layout,
          title: advised && advised.title != null ? advised.title : slide.title,
          subtitle: advised && advised.subtitle != null ? advised.subtitle : slide.subtitle,
          body: advised && advised.body != null ? advised.body : slide.body,
        };
      });
    } else {
      slides = sanitized;
    }

    const message =
      mode === 'advise'
        ? 'Советы ИИ применены к слайдам: заголовки и тезисы улучшены. Проверьте и нажмите «Сохранить».'
        : mode === 'author'
          ? 'ИИ написал презентацию по документу и медиатеке. Проверьте и нажмите «Сохранить».'
          : 'ИИ собрал черновик презентации из страниц документа. Проверьте и нажмите «Сохранить».';

    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'completed',
        payload: {
          ...jobPayload,
          documentId,
          versionId,
          provider,
          model,
          mode,
          draft: {
            title: typeof draft.title === 'string' ? draft.title.slice(0, 180) : document?.title ?? null,
            subtitle: typeof draft.subtitle === 'string' ? draft.subtitle.slice(0, 280) : null,
            slides,
          },
          message,
        },
      },
    });
  } catch (err) {
    const message = toReadableError(err);
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