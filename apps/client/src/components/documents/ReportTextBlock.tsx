import { useState, type ReactNode } from 'react';
import { ResizableContentWindow } from '../ui/ResizableContentWindow.js';

type Props = {
  title: string;
  windowTitle?: string;
  children: ReactNode;
  collapsible?: boolean;
  defaultExpanded?: boolean;
  onDismiss?: () => void;
  dismissLabel?: string;
};

export function ReportTextBlock({
  title,
  windowTitle,
  children,
  collapsible = false,
  defaultExpanded = true,
  onDismiss,
  dismissLabel = 'Закрыть и очистить',
}: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [windowOpen, setWindowOpen] = useState(false);

  return (
    <>
      <div className="rounded-xl border border-folio-100 bg-folio-50 p-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setWindowOpen(true)}
              className="cursor-pointer rounded px-2 py-0.5 text-xs font-medium text-folio-700 hover:bg-folio-100"
              title="Открыть в отдельном окне с изменением размера"
            >
              В окне
            </button>
            {collapsible && (
              <button
                type="button"
                onClick={() => setExpanded((prev) => !prev)}
                className="cursor-pointer rounded px-2 py-0.5 text-xs text-slate-600 hover:bg-folio-100"
              >
                {expanded ? 'Свернуть' : 'Развернуть'}
              </button>
            )}
            {onDismiss && (
              <button
                type="button"
                title={dismissLabel}
                aria-label={dismissLabel}
                onClick={onDismiss}
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-lg text-slate-400 hover:bg-folio-100 hover:text-slate-600"
              >
                ✕
              </button>
            )}
          </div>
        </div>
        {(!collapsible || expanded) && (
          <button
            type="button"
            onClick={() => setWindowOpen(true)}
            className="mt-2 w-full cursor-pointer rounded-lg text-left transition hover:bg-folio-100/60"
            title="Нажмите, чтобы открыть в отдельном окне"
          >
            <div className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{children}</div>
          </button>
        )}
      </div>

      <ResizableContentWindow
        open={windowOpen}
        title={windowTitle ?? title}
        onClose={() => setWindowOpen(false)}
      >
        <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{children}</p>
      </ResizableContentWindow>
    </>
  );
}
