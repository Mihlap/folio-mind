import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
};

export function DocumentMobileSheet({ open, title, onClose, children }: Props) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[120] flex flex-col justify-end md:hidden">
      <button
        type="button"
        className="pointer-events-auto absolute inset-0 cursor-default bg-slate-900/40"
        aria-label="Закрыть"
        onClick={onClose}
      />
      <div
        className="pointer-events-auto relative grid h-[85vh] w-full grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-t-2xl bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="document-mobile-sheet-title"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <h2
            id="document-mobile-sheet-title"
            className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 cursor-pointer rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-50"
          >
            Закрыть
          </button>
        </div>
        <div className="document-mobile-sheet__body scrollbar-thin min-h-0">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
