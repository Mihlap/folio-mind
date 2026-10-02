import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  PRESENTATION_SLIDE_LAYOUTS,
  splitSlideBullets,
  type PresentationSlideLayout,
} from '@folio-mind/pdf-contracts';
import {
  fetchMediaAssetDataUrl,
  useExportPresentationMutation,
  useGetJobQuery,
  useGetPresentationPreviewsQuery,
  useGetPresentationQuery,
  useListMediaAssetsQuery,
  useRequestPresentationAiMutation,
  useSavePresentationMutation,
  type MediaAssetItem,
  type PresentationAiRequestMode,
  type PresentationSlideDraft,
} from '@folio-mind/store';
import { SlideCanvas } from './presentation/SlideCanvas.js';

const LAYOUT_LABELS: Record<PresentationSlideLayout, string> = {
  title_only: 'Только текст',
  image_right: 'Текст слева',
  image_top: 'Картинка сверху',
  image_full: 'Картинка во весь слайд',
  section: 'Разделитель',
};

const LAYOUT_HINTS: Record<PresentationSlideLayout, string> = {
  title_only: 'Слайд без картинки: заголовок и тезисы.',
  image_right: 'Картинка справа, текст слева.',
  image_top: 'Картинка сверху, тезисы под ней.',
  image_full: 'Картинка во весь слайд, текст поверх неё.',
  section: 'Крупный заголовок без тезисов. Для перехода между частями.',
};

type AiModeOption = {
  mode: PresentationAiRequestMode;
  title: string;
  description: string;
};

const AI_MODE_OPTIONS: AiModeOption[] = [
  {
    mode: 'author',
    title: 'Написать с нуля',
    description:
      'ИИ сам прочитает документ и медиатеку и придумает слайды с заголовками и тезисами. Ваши слайды заменятся.',
  },
  {
    mode: 'assemble',
    title: 'Собрать из страниц',
    description:
      'ИИ разберёт текст документа и подберёт к нему страницы. Картинки будут из самого документа.',
  },
  {
    mode: 'advise',
    title: 'Улучшить текущие',
    description:
      'ИИ улучшит заголовки и тезисы уже собранных слайдов. Их количество и картинки не изменятся.',
  },
];

const STORAGE_PREFIX = 'folio-presentation-draft:';

type Props = {
  documentId: string;
  versionId: string;
  documentTitle: string;
  pageCount: number;
  versionReady: boolean;
  canEdit: boolean;
  token: string | null;
  onPresent: (deck: { title: string; slides: PresentationSlideDraft[] }) => void;
};

function draftKey(versionId: string) {
  return `${STORAGE_PREFIX}${versionId}`;
}

type LocalDraft = { title: string; slides: PresentationSlideDraft[] };

type PresentationAiDraft = {
  title: string | null;
  subtitle: string | null;
  slides: Array<{
    sourcePage: number | null;
    mediaAssetId: string | null;
    layoutVariant: PresentationSlideLayout;
    title: string | null;
    subtitle: string | null;
    body: string | null;
  }>;
};

type PresentationAiJobPayload = {
  draft?: PresentationAiDraft;
  message?: string;
  error?: string;
  mode?: string;
};

function readDraft(versionId: string): LocalDraft | null {
  try {
    const raw = sessionStorage.getItem(draftKey(versionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { title?: unknown; slides?: unknown };
    if (!Array.isArray(parsed.slides)) return null;
    return {
      title: typeof parsed.title === 'string' ? parsed.title : '',
      slides: parsed.slides as PresentationSlideDraft[],
    };
  } catch {
    return null;
  }
}

function writeDraft(versionId: string, value: LocalDraft) {
  try {
    sessionStorage.setItem(draftKey(versionId), JSON.stringify(value));
  } catch {
    return;
  }
}

function clearDraft(versionId: string) {
  try {
    sessionStorage.removeItem(draftKey(versionId));
  } catch {
    return;
  }
}

function renumber(slides: PresentationSlideDraft[]): PresentationSlideDraft[] {
  return slides.map((slide, index) => ({ ...slide, position: index }));
}

function bulletWord(count: number): string {
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'пунктов';
  const mod10 = count % 10;
  if (mod10 === 1) return 'пункт';
  if (mod10 >= 2 && mod10 <= 4) return 'пункта';
  return 'пунктов';
}

export function DocumentPresentationPanel({
  documentId,
  versionId,
  documentTitle,
  pageCount,
  versionReady,
  canEdit,
  token,
  onPresent,
}: Props) {
  const query = useGetPresentationQuery({ documentId, versionId }, { skip: !versionId });
  const mediaQuery = useListMediaAssetsQuery({ documentId });
  const mediaAssets = useMemo(() => mediaQuery.data?.items ?? [], [mediaQuery.data?.items]);
  const previews = useGetPresentationPreviewsQuery(
    { documentId, versionId },
    { skip: !versionId || !versionReady || pageCount <= 0 },
  );
  const [save] = useSavePresentationMutation();
  const [exportPresentation] = useExportPresentationMutation();
  const [requestAi] = useRequestPresentationAiMutation();

  const [title, setTitle] = useState(documentTitle);
  const [slides, setSlides] = useState<PresentationSlideDraft[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [loadedVersion, setLoadedVersion] = useState<string | null>(null);
  const [aiMode, setAiMode] = useState<'none' | PresentationAiRequestMode>('none');
  const [aiChoice, setAiChoice] = useState<PresentationAiRequestMode>('author');
  const [aiJobId, setAiJobId] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const { data: aiJob } = useGetJobQuery(aiJobId!, {
    skip: !aiJobId,
    pollingInterval: aiJobId ? 2000 : 0,
  });

  useEffect(() => {
    if (!aiJob || !aiJobId) return;
    if (aiJob.status === 'completed') {
      const payload = aiJob.payload as PresentationAiJobPayload | null;
      const draft = payload?.draft;
      if (draft && draft.slides.length > 0) {
        setTitle((prev) => draft.title ?? prev);
        const isAdvise = payload.mode === 'advise';
        if (isAdvise) {
          setSlides((prev) =>
            renumber(
              prev.map((slide, i) => {
                const advised = draft.slides[i];
                if (!advised) return slide;
                return {
                  ...slide,
                  layoutVariant: advised.layoutVariant,
                  title: advised.title ?? null,
                  subtitle: advised.subtitle ?? null,
                  body: advised.body ?? null,
                };
              }),
            ),
          );
        } else {
          setSlides(
            renumber(
              draft.slides.map((item, i) => ({
                position: i,
                title: item.title ?? null,
                subtitle: item.subtitle ?? null,
                body: item.body ?? null,
                notes: null,
                layoutVariant: item.layoutVariant,
                background: null,
                sourcePage: item.sourcePage ?? null,
                mediaAssetId: item.mediaAssetId ?? null,
              })),
            ),
          );
        }
        setAiMode(
          payload.mode === 'advise' || payload.mode === 'assemble' || payload.mode === 'author'
            ? payload.mode
            : 'none',
        );
        setStatus(payload.message ?? 'Черновик ИИ применён. Проверьте и нажмите «Сохранить».');
      } else {
        setStatus('ИИ вернул пустой черновик. Попробуйте другой режим.');
      }
      setAiJobId(null);
      setAiBusy(false);
    }
    if (aiJob.status === 'failed') {
      const payload = aiJob.payload as { error?: string } | null;
      setAiError(payload?.error ?? 'Не удалось подготовить черновик. Проверьте, что ИИ настроен.');
      setAiJobId(null);
      setAiBusy(false);
    }
  }, [aiJob, aiJobId]);

  const handleAi = useCallback(
    async (mode: PresentationAiRequestMode) => {
      if (!versionId) return;
      setAiError(null);
      setStatus(null);
      setAiBusy(true);
      try {
        const result = await requestAi({ documentId, versionId, mode }).unwrap();
        setAiJobId(result.jobId);
        if (mode === 'advise') {
          setStatus('ИИ готовит советы по слайдам…');
        } else if (mode === 'author') {
          setStatus('ИИ пишет презентацию по документу и медиатеке…');
        } else {
          setStatus('ИИ собирает презентацию из страниц документа…');
        }
      } catch {
        setAiError('Не удалось запустить ИИ. Проверьте, что ИИ настроен.');
        setAiBusy(false);
      }
    },
    [documentId, requestAi, versionId],
  );

  useEffect(() => {
    if (!versionId) return;
    if (loadedVersion === versionId) return;

    const draft = readDraft(versionId);
    if (draft) {
      setTitle(draft.title || documentTitle);
      setSlides(draft.slides);
      setDirty(true);
      setStatus(
        'Показан черновик из этой вкладки браузера. Нажмите «Сохранить», чтобы он не пропал.',
      );
      setLoadedVersion(versionId);
      return;
    }
    if (query.isLoading) return;
    const saved = query.data?.item;
    if (saved) {
      setTitle(saved.title);
      setSlides(saved.slides.map((slide) => ({ ...slide })));
    } else {
      setTitle(documentTitle);
      setSlides([]);
    }
    setDirty(false);
    setLoadedVersion(versionId);
  }, [documentTitle, loadedVersion, query.data?.item, query.isLoading, versionId]);

  useEffect(() => {
    if (!loadedVersion || loadedVersion !== versionId) return;
    writeDraft(versionId, { title, slides });
  }, [loadedVersion, slides, title, versionId]);

  const previewUrlByPage = useMemo(() => {
    const map = new Map<number, string>();
    for (const page of previews.data?.pages ?? []) {
      map.set(page.page, page.url);
    }
    return map;
  }, [previews.data?.pages]);

  const selected = selectedIndex == null ? null : (slides[selectedIndex] ?? null);

  const addSlide = useCallback((sourcePage: number) => {
    setSlides((prev) =>
      renumber([
        ...prev,
        {
          position: prev.length,
          title: null,
          subtitle: null,
          body: null,
          notes: null,
          layoutVariant: 'image_top',
          background: null,
          sourcePage,
          mediaAssetId: null,
        },
      ]),
    );
    setSelectedIndex((prev) => Math.max(0, prev ?? -1) + 1);
    setDirty(true);
  }, []);

  const addMediaSlide = useCallback(
    (mediaAssetId: string) => {
      setSlides((prev) =>
        renumber([
          ...prev,
          {
            position: prev.length,
            title: null,
            subtitle: null,
            body: null,
            notes: null,
            layoutVariant: 'image_right',
            background: null,
            sourcePage: null,
            mediaAssetId,
          },
        ]),
      );
      setSelectedIndex(slides.length);
      setDirty(true);
    },
    [slides.length],
  );

  const selectSlide = useCallback((index: number) => {
    setSelectedIndex(index);
  }, []);

  const patchSlide = useCallback((index: number, patch: Partial<PresentationSlideDraft>) => {
    setSlides((prev) => prev.map((slide, i) => (i === index ? { ...slide, ...patch } : slide)));
    setDirty(true);
  }, []);

  const patchSelected = useCallback(
    (patch: Partial<PresentationSlideDraft>) => {
      if (selectedIndex == null) return;
      patchSlide(selectedIndex, patch);
    },
    [patchSlide, selectedIndex],
  );

  const move = useCallback((from: number, to: number) => {
    setSlides((prev) => {
      if (from < 0 || from >= prev.length) return prev;
      const target = Math.max(0, Math.min(prev.length - 1, to));
      if (from === target) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(target, 0, moved);
      return renumber(next);
    });
    setSelectedIndex((prev) => {
      if (prev == null) return prev;
      if (prev === from) return to;
      if (from < prev && to >= prev) return prev - 1;
      if (from > prev && to <= prev) return prev + 1;
      return prev;
    });
    setDirty(true);
  }, []);

  const removeSlide = useCallback((index: number) => {
    setSlides((prev) => renumber(prev.filter((_, i) => i !== index)));
    setSelectedIndex((prev) => {
      if (prev == null) return prev;
      if (prev === index) return null;
      return prev > index ? prev - 1 : prev;
    });
    setDirty(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!versionId) return;
    setSaving(true);
    setStatus(null);
    try {
      await save({
        documentId,
        versionId,
        title: title.trim() || documentTitle,
        aiMode,
        slides: renumber(slides),
      }).unwrap();
      clearDraft(versionId);
      setDirty(false);
      setStatus('Презентация сохранена. Теперь её не потеряете при закрытии вкладки.');
    } catch {
      setStatus('Не удалось сохранить презентацию');
    } finally {
      setSaving(false);
    }
  }, [aiMode, documentId, documentTitle, save, slides, title, versionId]);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      await save({
        documentId,
        versionId,
        title: title.trim() || documentTitle,
        aiMode,
        slides: renumber(slides),
      }).unwrap();
      const result = await exportPresentation({ documentId, versionId }).unwrap();
      setDirty(false);
      setStatus(
        `Готово. PDF создаётся отдельным документом — найдите его в списке «Документы», он называется «${(title.trim() || documentTitle).slice(0, 40)} — PDF». Через минуту-две он будет готов.`,
      );
      void result;
    } catch {
      setStatus('Не удалось запустить экспорт в PDF');
    } finally {
      setExporting(false);
    }
  }, [aiMode, documentId, documentTitle, exportPresentation, save, slides, title, versionId]);

  const pageNumbers = useMemo(
    () => Array.from({ length: Math.max(0, pageCount) }, (_, i) => i + 1),
    [pageCount],
  );

  if (!versionReady) {
    return (
      <p className="text-sm text-slate-500">
        Дождитесь готовности версии, чтобы собрать презентацию.
      </p>
    );
  }

  if (pageCount <= 0) {
    return <p className="text-sm text-slate-500">В версии нет страниц для презентации.</p>;
  }

  const bullets = selected ? splitSlideBullets(selected.body) : [];

  return (
    <div className="space-y-4">
      <ol className="space-y-1 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
        <li className="flex gap-2">
          <span className="font-semibold">1.</span>
          <span>Слева нажмите на страницу или файл — она добавится слайдом справа.</span>
        </li>
        <li className="flex gap-2">
          <span className="font-semibold">2.</span>
          <span>Нажмите на слайд справа, чтобы выбрать его, и впишите заголовок и тезисы.</span>
        </li>
        <li className="flex gap-2">
          <span className="font-semibold">3.</span>
          <span>
            Нажмите «Сохранить». «Показать» — посмотреть на весь экран, «Экспорт в PDF» — получить
            файл отдельным документом.
          </span>
        </li>
      </ol>

      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[200px] flex-1 text-sm">
          <span className="mb-1 block text-xs text-slate-500">Название презентации</span>
          <input
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            value={title}
            maxLength={200}
            onChange={(event) => {
              setTitle(event.target.value);
              setDirty(true);
            }}
            disabled={!canEdit}
          />
        </label>
        <button
          type="button"
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50"
          onClick={handleSave}
          disabled={!canEdit || saving}
        >
          {saving ? 'Сохраняем…' : 'Сохранить'}
        </button>
        <button
          type="button"
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50"
          onClick={handleExport}
          disabled={!canEdit || exporting}
          title="Создаёт отдельный документ с PDF-версией презентации"
        >
          {exporting ? 'Готовим PDF…' : 'Экспорт в PDF'}
        </button>
        <button
          type="button"
          className="rounded-md bg-folio-600 px-3 py-1.5 text-sm text-white hover:bg-folio-700 disabled:opacity-50"
          onClick={() => onPresent({ title, slides })}
          disabled={slides.length === 0}
        >
          Показать
        </button>
      </div>

      <p className="text-xs text-slate-600">
        {slides.length === 0 ? 'Слайдов пока нет.' : `Слайдов: ${slides.length}.`}
        {dirty
          ? ' Есть несохранённые изменения — нажмите «Сохранить».'
          : ' Все изменения сохранены.'}
      </p>
      {status ? <p className="text-xs text-slate-700">{status}</p> : null}
      {!canEdit ? (
        <p className="text-xs text-slate-500">У вас доступ только для просмотра.</p>
      ) : null}
      {previews.data?.status === 'processing' ? (
        <p className="text-xs text-slate-500">Готовим превью страниц…</p>
      ) : null}

      {canEdit ? (
        <details className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">
            Не хочу собирать вручную — пусть сделает ИИ
          </summary>
          <p className="mt-1 mb-2 text-xs text-slate-600">
            ИИ прочитает документ и подготовит черновик за 20–60 секунд. Слайды он заменит на свои —
            поэтому сначала сохраните то, что уже собрали вручную.
          </p>
          <div className="space-y-1.5">
            {AI_MODE_OPTIONS.map((option) => {
              const isChosen = aiChoice === option.mode;
              const blocked = aiBusy || (option.mode === 'advise' && slides.length === 0);
              return (
                <label
                  key={option.mode}
                  className={`flex cursor-pointer items-start gap-2 rounded border p-2 ${
                    isChosen
                      ? 'border-folio-500 bg-folio-50'
                      : 'border-slate-200 bg-white hover:border-folio-300'
                  } ${blocked ? 'cursor-not-allowed opacity-50' : ''}`}
                >
                  <input
                    type="radio"
                    name="presentation-ai-mode"
                    className="mt-0.5"
                    checked={isChosen}
                    disabled={blocked}
                    onChange={() => setAiChoice(option.mode)}
                  />
                  <span className="min-w-0">
                    <span className="block text-xs font-medium text-slate-800">{option.title}</span>
                    <span className="block text-[11px] text-slate-600">
                      {option.mode === 'advise' && slides.length === 0
                        ? 'Сначала добавьте хотя бы один слайд вручную — этот режим улучшает готовые.'
                        : option.description}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
          <button
            type="button"
            className="mt-2 rounded-md border border-folio-600 bg-folio-600 px-3 py-1.5 text-sm text-white transition-colors hover:bg-folio-700 disabled:opacity-50"
            onClick={() => void handleAi(aiChoice)}
            disabled={aiBusy || (aiChoice === 'advise' && slides.length === 0)}
          >
            {aiBusy ? 'ИИ работает…' : 'Собрать черновик'}
          </button>
          <p className="mt-1 text-[11px] text-slate-500">
            Черновик сразу заменит слайды. Посмотрите его и нажмите «Сохранить», если понравилось.
          </p>
          {aiError ? <p className="mt-1 text-xs text-red-600">{aiError}</p> : null}
        </details>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
        <div className="space-y-3">
          <div>
            <p className="text-xs font-medium text-slate-700">Шаг 1. Нажмите на страницу</p>
            <p className="mb-1 text-[11px] text-slate-500">
              Каждая страница станет отдельным слайдом. Нажимать можно сколько угодно раз.
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {pageNumbers.map((page) => (
                <button
                  key={page}
                  type="button"
                  title={`Добавить слайд со страницей ${page}`}
                  className="flex aspect-[3/4] flex-col items-center justify-center overflow-hidden rounded border border-slate-200 bg-slate-50 text-xs text-slate-600 transition-colors hover:border-folio-500 hover:bg-folio-50"
                  onClick={() => addSlide(page)}
                  disabled={!canEdit}
                >
                  <PageThumb page={page} url={previewUrlByPage.get(page)} />
                  <span className="sr-only">Страница {page}</span>
                </button>
              ))}
            </div>
          </div>

          {mediaAssets.length > 0 ? (
            <div>
              <p className="text-xs font-medium text-slate-700">Или возьмите файл из медиатеки</p>
              <div className="mt-1 grid grid-cols-3 gap-1.5">
                {mediaAssets.map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    title={`Добавить слайд с файлом «${asset.title}»`}
                    className="overflow-hidden rounded border border-slate-200 bg-slate-50 transition-colors hover:border-folio-500 hover:bg-folio-50"
                    onClick={() => addMediaSlide(asset.id)}
                    disabled={!canEdit}
                  >
                    <MediaThumb asset={asset} token={token} />
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="space-y-2">
          <p className="hidden text-xs font-medium text-slate-700 lg:block">
            Шаг 2. Нажмите на слайд, чтобы выбрать его
          </p>
          {slides.map((slide, index) => (
            <div
              key={slide.id ?? `new-${index}`}
              role="button"
              tabIndex={0}
              aria-pressed={index === selectedIndex}
              onClick={() => selectSlide(index)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  selectSlide(index);
                }
              }}
              className={`flex cursor-pointer gap-3 rounded-md border-2 p-2 transition-colors ${
                index === selectedIndex
                  ? 'border-folio-500 bg-folio-50'
                  : 'border-slate-200 hover:border-folio-300 hover:bg-folio-50/40'
              }`}
            >
              <span
                className={`w-6 shrink-0 pt-2 text-center text-xs font-semibold ${
                  index === selectedIndex ? 'text-folio-700' : 'text-slate-500'
                }`}
              >
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <SlideCanvas
                  slide={slide}
                  mediaAssets={mediaAssets}
                  pageUrl={
                    slide.sourcePage != null
                      ? (previewUrlByPage.get(slide.sourcePage) ?? null)
                      : null
                  }
                  token={token}
                  className="rounded"
                />
                <input
                  className="mt-2 w-full rounded border border-slate-200 px-2 py-1 text-sm"
                  placeholder="Заголовок"
                  value={slide.title ?? ''}
                  maxLength={200}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => patchSlide(index, { title: event.target.value })}
                  disabled={!canEdit}
                />
              </div>
              <div
                className="flex shrink-0 flex-col gap-1"
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  className="rounded border border-slate-200 px-1.5 text-xs disabled:opacity-40"
                  title="Поднять выше"
                  onClick={() => move(index, index - 1)}
                  disabled={!canEdit || index === 0}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="rounded border border-slate-200 px-1.5 text-xs disabled:opacity-40"
                  title="Опустить ниже"
                  onClick={() => move(index, index + 1)}
                  disabled={!canEdit || index === slides.length - 1}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="rounded border border-red-200 px-1.5 text-xs text-red-600 disabled:opacity-40"
                  title="Удалить слайд"
                  onClick={() => removeSlide(index)}
                  disabled={!canEdit}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {slides.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-300 p-4 text-sm leading-relaxed text-slate-600">
          <p className="font-medium text-slate-800">Здесь появятся слайды</p>
          <p className="mt-1">
            Слайд — это одна страница презентации. Начните слева: нажмите на любую страницу
            документа, и здесь появится первый слайд.
          </p>
          <p className="mt-1">Не хотите вручную? Ниже есть кнопка, где ИИ соберёт черновик сам.</p>
        </div>
      ) : null}

      {selected ? (
        <div className="space-y-3 rounded-md border-2 border-folio-500 bg-folio-50/40 p-3">
          <p className="text-sm font-semibold text-slate-800">
            Шаг 2. Слайд {selectedIndex != null ? selectedIndex + 1 : ''} — оформление и текст
          </p>
          <p className="text-[11px] text-slate-500">
            Это выбранный вами слайд. Что вы напишете здесь, попадёт только в него.
          </p>
          <div>
            <p className="mb-1 text-xs font-medium text-slate-700">Как выглядит слайд</p>
            <div className="flex flex-wrap gap-1.5">
              {PRESENTATION_SLIDE_LAYOUTS.map((layout) => (
                <button
                  key={layout}
                  type="button"
                  className={`rounded border px-2 py-1 text-xs transition-colors ${
                    selected.layoutVariant === layout
                      ? 'border-folio-600 bg-folio-600 text-white'
                      : 'border-slate-300 hover:border-folio-300 hover:bg-folio-50'
                  }`}
                  title={LAYOUT_HINTS[layout]}
                  onClick={() => patchSelected({ layoutVariant: layout })}
                  disabled={!canEdit}
                >
                  {LAYOUT_LABELS[layout]}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              {LAYOUT_HINTS[selected.layoutVariant as PresentationSlideLayout] ??
                LAYOUT_HINTS.image_top}
            </p>
          </div>
          <p className="text-xs font-medium text-slate-700">Текст слайда</p>
          <input
            className="w-full rounded border border-slate-200 px-2 py-1 text-sm"
            placeholder="Подзаголовок"
            value={selected.subtitle ?? ''}
            maxLength={300}
            onChange={(event) => patchSelected({ subtitle: event.target.value })}
            disabled={!canEdit}
          />
          <textarea
            className="w-full rounded border border-slate-200 px-2 py-1 text-sm"
            placeholder="Тезисы, каждый с новой строки"
            rows={3}
            value={selected.body ?? ''}
            maxLength={2000}
            onChange={(event) => patchSelected({ body: event.target.value })}
            disabled={!canEdit}
          />
          {bullets.length > 0 ? (
            <p className="text-xs text-slate-500">
              На слайде: {bullets.length} {bulletWord(bullets.length)}
            </p>
          ) : null}
          <textarea
            className="w-full rounded border border-slate-200 px-2 py-1 text-sm"
            placeholder="Заметки для докладчика (в PDF не попадут)"
            rows={2}
            value={selected.notes ?? ''}
            maxLength={2000}
            onChange={(event) => patchSelected({ notes: event.target.value })}
            disabled={!canEdit}
          />
        </div>
      ) : null}
    </div>
  );
}

function PageThumb({ page, url }: { page: number; url?: string | null }) {
  const [src, setSrc] = useState(url);
  useEffect(() => setSrc(url), [url]);
  if (!src) return <span>{page}</span>;
  return (
    <img
      src={src}
      alt={`Страница ${page}`}
      onError={() => setSrc(null)}
      className="h-full w-full object-cover"
    />
  );
}

function MediaThumb({ asset, token }: { asset: MediaAssetItem; token: string | null }) {
  const [src, setSrc] = useState<string | null>(asset.thumbUrl ?? asset.previewUrl);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSrc(asset.thumbUrl ?? asset.previewUrl);
    setFailed(false);
    if (asset.thumbUrl ?? asset.previewUrl) return;
    void (async () => {
      try {
        const dataUrl = await fetchMediaAssetDataUrl(asset.id, token);
        if (!cancelled) setSrc(dataUrl);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [asset.id, asset.previewUrl, asset.thumbUrl, token]);

  if (failed) {
    return <span className="block px-1 py-2 text-center text-[10px] text-slate-400">нет</span>;
  }
  if (!src) {
    return <span className="block px-1 py-2 text-center text-[10px] text-slate-400">…</span>;
  }
  return (
    <img
      src={src}
      alt={asset.title}
      onError={() => setFailed(true)}
      className="h-14 w-full object-cover"
    />
  );
}
