import { useEffect, type ReactNode } from 'react';

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
};

export function ResizableContentWindow({ open, title, onClose, children }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center p-2 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="resizable-content-window-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-slate-900/40"
        aria-label="Закрыть окно"
        onClick={onClose}
      />
      <div
        className="relative flex max-h-[92vh] min-h-[min(40vh,280px)] w-[min(96vw,36rem)] min-w-[min(96vw,280px)] max-w-[95vw] resize flex-col overflow-hidden rounded-t-xl bg-white shadow-2xl ring-1 ring-slate-200 sm:rounded-xl"
        style={{ height: 'min(60vh, 480px)' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5 sm:px-4">
          <h2 id="resizable-content-window-title" className="min-w-0 truncate text-sm font-semibold text-slate-900">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 cursor-pointer rounded-lg px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
          >
            Закрыть
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-3 py-3 sm:px-4 sm:py-4">{children}</div>
        <span
          className="pointer-events-none absolute bottom-1 right-1 select-none text-[10px] text-slate-300"
          aria-hidden
        >
          ↘
        </span>
      </div>
    </div>
  );
}
