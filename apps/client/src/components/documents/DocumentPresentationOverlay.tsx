import { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { PdfViewer } from '@folio-mind/ui';
import {
  useGetPresentationPreviewsQuery,
  useListMediaAssetsQuery,
  type MediaAssetItem,
} from '@folio-mind/store';
import { SlideCanvas, type SlideLike } from './presentation/SlideCanvas.js';

type Props = {
  open: boolean;
  onClose: () => void;
  documentTitle: string;
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  pdfUrl?: string;
  pdfData?: Uint8Array;
  pdfSourceKey?: string;
  pdfReady: boolean;
  documentId?: string;
  versionId?: string;
  deckTitle?: string | null;
  slides?: SlideLike[];
  token?: string | null;
};

export function DocumentPresentationOverlay({
  open,
  onClose,
  documentTitle,
  page,
  pageCount,
  onPageChange,
  pdfUrl,
  pdfData,
  pdfSourceKey,
  pdfReady,
  documentId,
  versionId,
  deckTitle,
  slides,
  token,
}: Props) {
  const deck = useMemo(() => (slides ?? []).filter(Boolean), [slides]);
  const deckLength = deck.length;
  const isDeckMode = deckLength > 0;
  const position = Math.min(Math.max(1, page), Math.max(1, deckLength || pageCount || 1));

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      const total = isDeckMode ? deckLength : pageCount;
      if (event.key === 'ArrowRight' || event.key === ' ' || event.key === 'PageDown') {
        event.preventDefault();
        if (total > 0 && position < total) onPageChange(position + 1);
        return;
      }
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault();
        if (position > 1) onPageChange(position - 1);
        return;
      }
      if (event.key === 'Home') {
        event.preventDefault();
        onPageChange(1);
        return;
      }
      if (event.key === 'End' && total > 0) {
        event.preventDefault();
        onPageChange(total);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [deckLength, isDeckMode, onClose, onPageChange, pageCount, position, open]);

  if (!open) return null;

  const total = isDeckMode ? deckLength : pageCount;
  const heading = isDeckMode ? (deckTitle?.trim() || documentTitle) : documentTitle;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex flex-col bg-black text-white"
      role="dialog"
      aria-modal="true"
      aria-label="Режим презентации"
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{heading}</p>
          <p className="text-xs text-white/60">
            {isDeckMode ? 'Слайд' : 'Стр.'} {position}
            {total > 0 ? ` из ${total}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 cursor-pointer rounded-lg border border-white/20 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10"
        >
          Выйти · Esc
        </button>
      </header>

      <div className="relative min-h-0 flex-1">
        {isDeckMode ? (
          <DeckStage
            slides={deck}
            index={position - 1}
            documentId={documentId}
            versionId={versionId}
            token={token ?? null}
          />
        ) : pdfReady && (pdfUrl || pdfData) ? (
          <PdfViewer
            className="h-full min-h-0"
            url={pdfUrl}
            pdfData={pdfData}
            sourceKey={pdfSourceKey}
            page={page}
            onPageChange={onPageChange}
            displayMode="single"
            zoomMode="fit-width"
            customScale={1}
            searchQuery=""
            enableTextSelection={false}
            surfaceTone="dark"
            showPageNav
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-white/70">
            <span
              className="inline-block h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-white"
              aria-hidden
            />
            <p>Загрузка документа…</p>
          </div>
        )}
      </div>

      <footer className="flex shrink-0 items-center justify-center gap-4 border-t border-white/10 px-4 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-[11px] text-white/50">
        <span>← → или пробел — листать</span>
        <span className="hidden sm:inline">Esc — выход</span>
      </footer>
    </div>,
    document.body,
  );
}

function DeckStage({
  slides,
  index,
  documentId,
  versionId,
  token,
}: {
  slides: SlideLike[];
  index: number;
  documentId?: string;
  versionId?: string;
  token: string | null;
}) {
  const previews = useGetPresentationPreviewsQuery(
    { documentId: documentId ?? '', versionId: versionId ?? '' },
    { skip: !documentId || !versionId },
  );
  const media = useListMediaAssetsQuery(documentId ? { documentId } : undefined);
  const mediaAssets: MediaAssetItem[] = media.data?.items ?? [];

  const urlByPage = useMemo(() => {
    const map = new Map<number, string>();
    for (const item of previews.data?.pages ?? []) map.set(item.page, item.url);
    return map;
  }, [previews.data?.pages]);

  const slide = slides[index];
  if (!slide) return null;

  return (
    <div className="flex h-full w-full items-center justify-center p-4">
      <div className="w-full max-w-[min(100%,calc((100vh-8rem)*16/9))]">
        <SlideCanvas
          slide={slide}
          mediaAssets={mediaAssets}
          pageUrl={slide.sourcePage != null ? (urlByPage.get(slide.sourcePage) ?? null) : null}
          token={token}
          className="rounded-lg shadow-2xl"
          interactive
        />
        {slide.notes ? (
          <p className="mt-3 max-h-24 overflow-y-auto text-center text-xs text-white/60">
            {slide.notes}
          </p>
        ) : null}
      </div>
    </div>
  );
}
