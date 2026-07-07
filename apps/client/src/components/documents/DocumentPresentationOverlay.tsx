import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { PdfViewer } from '@folio-mind/ui';

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
}: Props) {
  const canGoPrev = page > 1;
  const canGoNext = pageCount > 0 ? page < pageCount : false;

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
      if (event.key === 'ArrowRight' || event.key === ' ' || event.key === 'PageDown') {
        event.preventDefault();
        if (canGoNext) onPageChange(page + 1);
        return;
      }
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault();
        if (canGoPrev) onPageChange(page - 1);
        return;
      }
      if (event.key === 'Home') {
        event.preventDefault();
        onPageChange(1);
        return;
      }
      if (event.key === 'End' && pageCount > 0) {
        event.preventDefault();
        onPageChange(pageCount);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose, onPageChange, page, pageCount, canGoNext, canGoPrev]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex flex-col bg-black text-white"
      role="dialog"
      aria-modal="true"
      aria-label="Режим презентации"
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{documentTitle}</p>
          <p className="text-xs text-white/60">
            Стр. {page}
            {pageCount > 0 ? ` из ${pageCount}` : ''}
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
        {pdfReady && (pdfUrl || pdfData) ? (
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
