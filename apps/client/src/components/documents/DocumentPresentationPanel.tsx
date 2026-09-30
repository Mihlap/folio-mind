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
  const [aiJobId, setAiJobId] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

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
        setAiMode(payload.mode === 'advise' || payload.mode === 'assemble' || payload.mode === 'author' ? payload.mode : 'none');
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
  }, []);

  const addMediaSlide = useCallback((mediaAssetId: string) => {
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
  }, []);

  const patchSelected = useCallback((patch: Partial<PresentationSlideDraft>) => {
    setSelectedIndex((index) => {
      if (index == null) return index;
      setSlides((prev) =>
        prev.map((slide, i) => (i === index ? { ...slide, ...patch, position: i } : slide)),
      );
      return index;
    });
  }, []);

  const move = useCallback(
    (from: number, to: number) => {
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
    },
    [],
  );

  const removeSlide = useCallback((index: number) => {
    setSlides((prev) => renumber(prev.filter((_, i) => i !== index)));
    setSelectedIndex((prev) => {
      if (prev == null) return prev;
      if (prev === index) return null;
      return prev > index ? prev - 1 : prev;
    });
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
      setStatus('Презентация сохранена');
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
      setStatus(`PDF создаётся в отдельном документе: ${result.documentId}`);
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
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[200px] flex-1 text-sm">
          <span className="mb-1 block text-xs text-slate-500">Название презентации</span>
          <input
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            value={title}
            maxLength={200}
            onChange={(event) => setTitle(event.target.value)}
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
        >
          {exporting ? 'Готовим PDF…' : 'Экспорт в PDF'}
        </button>
        <button
          type="button"
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          onClick={() => onPresent({ title, slides })}
          disabled={slides.length === 0}
        >
          Показать
        </button>
      </div>

      {status ? <p className="text-xs text-slate-600">{status}</p> : null}
      {!canEdit ? (
        <p className="text-xs text-slate-500">У вас доступ только для просмотра.</p>
      ) : null}
      {previews.data?.status === 'processing' ? (
        <p className="text-xs text-slate-500">Готовим превью страниц…</p>
      ) : null}

      {canEdit ? (
        <div className="space-y-2 rounded-md border border-slate-200 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-600">ИИ-помощник</span>
            <button
              type="button"
              className="rounded border border-slate-300 px-2.5 py-1 text-xs disabled:opacity-50"
              title="Улучшить заголовки и тезисы готовых слайдов"
              onClick={() => void handleAi('advise')}
              disabled={aiBusy || slides.length === 0}
            >
              Совет
            </button>
            <button
              type="button"
              className="rounded border border-slate-300 px-2.5 py-1 text-xs disabled:opacity-50"
              title="Собрать презентацию из страниц документа"
              onClick={() => void handleAi('assemble')}
              disabled={aiBusy}
            >
              Собрать
            </button>
            <button
              type="button"
              className="rounded border border-slate-300 px-2.5 py-1 text-xs disabled:opacity-50"
              title="Написать презентацию по документу и медиатеке"
              onClick={() => void handleAi('author')}
              disabled={aiBusy}
            >
              Написать
            </button>
          </div>
          <p className="text-[11px] text-slate-500">
            Черновик ИИ применяется к слайдам — проверьте и нажмите «Сохранить».
          </p>
          {aiError ? <p className="text-xs text-red-600">{aiError}</p> : null}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
        <div className="space-y-3">
          <div>
            <p className="mb-1 text-xs font-medium text-slate-600">Страницы документа</p>
            <div className="grid grid-cols-3 gap-1.5">
              {pageNumbers.map((page) => {
                const url = previewUrlByPage.get(page);
                return (
                  <button
                    key={page}
                    type="button"
                    title={`Добавить страницу ${page}`}
                    className="flex aspect-[3/4] flex-col items-center justify-center overflow-hidden rounded border border-slate-200 bg-slate-50 text-xs text-slate-600 hover:border-slate-400"
                    onClick={() => addSlide(page)}
                    disabled={!canEdit}
                  >
                    {url ? (
                      <img src={url} alt={`Страница ${page}`} className="h-full w-full object-cover" />
                    ) : (
                      <span>{page}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {mediaAssets.length > 0 ? (
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">Медиатека</p>
              <div className="grid grid-cols-3 gap-1.5">
                {mediaAssets.map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    title={asset.title}
                    className="overflow-hidden rounded border border-slate-200 bg-slate-50 hover:border-slate-400"
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
          {slides.length === 0 ? (
            <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">
              Выберите страницы или файлы слева, чтобы собрать слайды. Порядок задаётся стрелками.
            </p>
          ) : null}

          {slides.map((slide, index) => (
            <div
              key={slide.id ?? `new-${index}`}
              className={`flex gap-3 rounded-md border p-2 ${
                index === selectedIndex ? 'border-slate-900' : 'border-slate-200'
              }`}
            >
              <span className="w-6 shrink-0 pt-2 text-center text-xs text-slate-500">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <SlideCanvas
                  slide={slide}
                  mediaAssets={mediaAssets}
                  pageUrl={
                    slide.sourcePage != null ? (previewUrlByPage.get(slide.sourcePage) ?? null) : null
                  }
                  token={token}
                  className="rounded"
                />
                <input
                  className="mt-2 w-full rounded border border-slate-200 px-2 py-1 text-sm"
                  placeholder="Заголовок"
                  value={slide.title ?? ''}
                  maxLength={200}
                  onChange={(event) => patchSelected({ title: event.target.value })}
                  onFocus={() => setSelectedIndex(index)}
                  disabled={!canEdit}
                />
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                <button
                  type="button"
                  className="rounded border border-slate-200 px-1.5 text-xs disabled:opacity-40"
                  title="Выше"
                  onClick={() => move(index, index - 1)}
                  disabled={!canEdit || index === 0}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="rounded border border-slate-200 px-1.5 text-xs disabled:opacity-40"
                  title="Ниже"
                  onClick={() => move(index, index + 1)}
                  disabled={!canEdit || index === slides.length - 1}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="rounded border border-red-200 px-1.5 text-xs text-red-600 disabled:opacity-40"
                  title="Удалить"
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

      {selected ? (
        <div className="space-y-2 rounded-md border border-slate-200 p-3">
          <p className="text-xs font-medium text-slate-600">
            Слайд {selectedIndex != null ? selectedIndex + 1 : ''}: оформление и текст
          </p>
          <div className="flex flex-wrap gap-1.5">
            {PRESENTATION_SLIDE_LAYOUTS.map((layout) => (
              <button
                key={layout}
                type="button"
                className={`rounded border px-2 py-1 text-xs ${
                  selected.layoutVariant === layout
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-300'
                }`}
                onClick={() => patchSelected({ layoutVariant: layout })}
                disabled={!canEdit}
              >
                {LAYOUT_LABELS[layout]}
              </button>
            ))}
          </div>
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
            <p className="text-xs text-slate-500">На слайде: {bullets.length} {bulletWord(bullets.length)}</p>
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
  return <img src={src} alt={asset.title} className="h-14 w-full object-cover" />;
}

