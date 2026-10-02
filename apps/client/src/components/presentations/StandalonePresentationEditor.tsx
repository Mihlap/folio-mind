import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  PRESENTATION_SLIDE_LAYOUTS,
  splitSlideBullets,
  type PresentationSlideLayout,
} from '@folio-mind/pdf-contracts';
import {
  fetchMediaAssetDataUrl,
  useExportPresentationMutation,
  useGetPresentationByIdQuery,
  useListMediaAssetsQuery,
  useSavePresentationMutation,
  type MediaAssetItem,
  type PresentationSlideDraft,
} from '@folio-mind/store';
import { SlideCanvas } from '../documents/presentation/SlideCanvas.js';
import { DocumentPresentationOverlay } from '../documents/DocumentPresentationOverlay.js';
import { useAppSelector } from '../../hooks/index.js';

const LAYOUT_LABELS: Record<PresentationSlideLayout, string> = {
  title_only: 'Только текст',
  image_right: 'Текст слева',
  image_top: 'Картинка сверху',
  image_full: 'Картинка во весь слайд',
  section: 'Разделитель',
};

const STORAGE_PREFIX = 'folio-standalone-draft:';

type Props = {
  presentationId?: string;
};

type LocalDraft = { title: string; slides: PresentationSlideDraft[] };

function draftKey(presentationId?: string) {
  return `${STORAGE_PREFIX}${presentationId ?? 'new'}`;
}

function readDraft(presentationId?: string): LocalDraft | null {
  try {
    const raw = sessionStorage.getItem(draftKey(presentationId));
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

function writeDraft(presentationId: string | undefined, value: LocalDraft) {
  try {
    sessionStorage.setItem(draftKey(presentationId), JSON.stringify(value));
  } catch {
    return;
  }
}

function clearDraft(presentationId?: string) {
  try {
    sessionStorage.removeItem(draftKey(presentationId));
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

function MiniMediaThumb({ asset, token }: { asset: MediaAssetItem; token: string | null }) {
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

export function StandalonePresentationEditor({ presentationId }: Props) {
  const token = useAppSelector((s) => s.auth.token);
  const query = useGetPresentationByIdQuery(presentationId ?? '', { skip: !presentationId });
  const mediaQuery = useListMediaAssetsQuery();
  const mediaAssets = useMemo(() => mediaQuery.data?.items ?? [], [mediaQuery.data?.items]);
  const [save] = useSavePresentationMutation();
  const [exportPresentation] = useExportPresentationMutation();

  const [title, setTitle] = useState('Новая презентация');
  const [slides, setSlides] = useState<PresentationSlideDraft[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(presentationId ?? null);
  const [presented, setPresented] = useState(false);
  const [presentPage, setPresentPage] = useState(1);

  useEffect(() => {
    if (hydrated) return;
    if (presentationId && query.isLoading) return;

    const draft = readDraft(presentationId);
    if (draft) {
      setTitle(draft.title || 'Новая презентация');
      setSlides(draft.slides);
    } else if (presentationId) {
      const saved = query.data?.item;
      if (saved) {
        setTitle(saved.title);
        setSlides(saved.slides.map((slide) => ({ ...slide })));
        setSavedId(saved.id);
      } else {
        setTitle('Новая презентация');
        setSlides([]);
      }
    }
    setHydrated(true);
  }, [hydrated, presentationId, query.data?.item, query.isLoading]);

  useEffect(() => {
    if (!hydrated) return;
    writeDraft(presentationId, { title, slides });
  }, [hydrated, presentationId, slides, title]);

  useEffect(() => {
    setPresentPage((prev) => Math.min(prev, Math.max(1, slides.length)));
  }, [slides.length]);

  const selected = selectedIndex == null ? null : (slides[selectedIndex] ?? null);

  const addBlankSlide = useCallback(() => {
    setSlides((prev) =>
      renumber([
        ...prev,
        {
          position: prev.length,
          title: null,
          subtitle: null,
          body: null,
          notes: null,
          layoutVariant: 'title_only',
          background: null,
          sourcePage: null,
          mediaAssetId: null,
        },
      ]),
    );
    setSelectedIndex(slides.length);
  }, [slides.length]);

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

  const selectSlide = useCallback((index: number) => {
    setSelectedIndex(index);
  }, []);

  const patchSlide = useCallback((index: number, patch: Partial<PresentationSlideDraft>) => {
    setSlides((prev) => prev.map((slide, i) => (i === index ? { ...slide, ...patch } : slide)));
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
  }, []);

  const removeSlide = useCallback((index: number) => {
    setSlides((prev) => renumber(prev.filter((_, i) => i !== index)));
    setSelectedIndex((prev) => {
      if (prev == null) return prev;
      if (prev === index) return null;
      return prev > index ? prev - 1 : prev;
    });
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setStatus(null);
    try {
      const payload = {
        ...(savedId ? { id: savedId } : {}),
        title: title.trim() || 'Без названия',
        aiMode: 'none' as const,
        slides: renumber(slides),
      };
      const result = await save(payload).unwrap();
      setSavedId(result.id);
      clearDraft(presentationId);
      setStatus('Презентация сохранена');
    } catch {
      setStatus('Не удалось сохранить презентацию');
    } finally {
      setSaving(false);
    }
  }, [presentationId, save, savedId, slides, title]);

  const handleExport = useCallback(async () => {
    setExporting(true);
    setStatus(null);
    try {
      const payload = {
        ...(savedId ? { id: savedId } : {}),
        title: title.trim() || 'Без названия',
        aiMode: 'none' as const,
        slides: renumber(slides),
      };
      const saved = await save(payload).unwrap();
      setSavedId(saved.id);
      const result = await exportPresentation({ presentationId: saved.id }).unwrap();
      setStatus(`PDF создаётся в отдельном документе: ${result.documentId}`);
    } catch {
      setStatus('Не удалось запустить экспорт в PDF');
    } finally {
      setExporting(false);
    }
  }, [exportPresentation, save, savedId, slides, title]);

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
          />
        </label>
        <button
          type="button"
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50"
          onClick={() => void handleSave()}
          disabled={saving}
        >
          {saving ? 'Сохраняем…' : 'Сохранить'}
        </button>
        <button
          type="button"
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50"
          onClick={() => void handleExport()}
          disabled={exporting}
        >
          {exporting ? 'Готовим PDF…' : 'Экспорт в PDF'}
        </button>
        <button
          type="button"
          className="rounded-md bg-folio-600 px-3 py-1.5 text-sm text-white hover:bg-folio-700 disabled:opacity-50"
          onClick={() => {
            setPresentPage(1);
            setPresented(true);
          }}
          disabled={slides.length === 0}
        >
          Показать
        </button>
      </div>

      <p className="text-xs font-medium text-slate-700">
        Шаг 2. Нажмите на слайд справа, чтобы выбрать его
      </p>
      {status ? <p className="text-xs text-slate-700">{status}</p> : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
        <div className="space-y-3">
          <button
            type="button"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm transition-colors hover:border-folio-500 hover:bg-folio-50"
            onClick={addBlankSlide}
          >
            + Пустой слайд
          </button>

          {mediaAssets.length > 0 ? (
            <div>
              <p className="text-xs font-medium text-slate-700">Или возьмите файл из медиатеки</p>
              <div className="grid grid-cols-3 gap-1.5">
                {mediaAssets.map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    title={asset.title}
                    className="overflow-hidden rounded border border-slate-200 bg-slate-50 transition-colors hover:border-folio-500 hover:bg-folio-50"
                    onClick={() => addMediaSlide(asset.id)}
                  >
                    <MiniMediaThumb asset={asset} token={token ?? null} />
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="space-y-2">
          {slides.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-300 p-4 text-sm leading-relaxed text-slate-600">
              <p className="font-medium text-slate-800">Здесь появятся слайды</p>
              <p className="mt-1">
                Слайд — это одна страница презентации. Слева нажмите «+ Пустой слайд» или картинку
                из медиатеки, и здесь появится первый слайд.
              </p>
            </div>
          ) : null}

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
                  pageUrl={null}
                  token={token ?? null}
                  className="rounded"
                />
                <input
                  className="mt-2 w-full rounded border border-slate-200 px-2 py-1 text-sm"
                  placeholder="Заголовок"
                  value={slide.title ?? ''}
                  maxLength={200}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => patchSlide(index, { title: event.target.value })}
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
                  disabled={index === 0}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="rounded border border-slate-200 px-1.5 text-xs disabled:opacity-40"
                  title="Опустить ниже"
                  onClick={() => move(index, index + 1)}
                  disabled={index === slides.length - 1}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="rounded border border-red-200 px-1.5 text-xs text-red-600 disabled:opacity-40"
                  title="Удалить слайд"
                  onClick={() => removeSlide(index)}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {selected ? (
        <div className="space-y-2 rounded-md border-2 border-folio-500 bg-folio-50/40 p-3">
          <p className="text-xs font-medium text-folio-800">
            Слайд {selectedIndex != null ? selectedIndex + 1 : ''}: оформление и текст
          </p>
          <div className="flex flex-wrap gap-1.5">
            {PRESENTATION_SLIDE_LAYOUTS.map((layout) => (
              <button
                key={layout}
                type="button"
                className={`rounded border px-2 py-1 text-xs transition-colors ${
                  selected.layoutVariant === layout
                    ? 'border-folio-600 bg-folio-600 text-white'
                    : 'border-slate-300 hover:border-folio-300 hover:bg-white'
                }`}
                onClick={() => patchSelected({ layoutVariant: layout })}
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
          />
          <textarea
            className="w-full rounded border border-slate-200 px-2 py-1 text-sm"
            placeholder="Тезисы, каждый с новой строки"
            rows={3}
            value={selected.body ?? ''}
            maxLength={2000}
            onChange={(event) => patchSelected({ body: event.target.value })}
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
          />
        </div>
      ) : null}

      <DocumentPresentationOverlay
        open={presented}
        onClose={() => setPresented(false)}
        documentTitle={title.trim() || 'Презентация'}
        page={presentPage}
        pageCount={slides.length}
        onPageChange={setPresentPage}
        pdfReady={false}
        deckTitle={title.trim() || 'Презентация'}
        slides={presented ? slides : []}
        token={token ?? null}
      />
    </div>
  );
}
