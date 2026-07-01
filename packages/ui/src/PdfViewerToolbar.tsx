import type { ReactNode } from 'react';
import type { PdfViewerDisplayMode, PdfViewerZoomMode } from './PdfViewer.js';
type PdfViewerToolbarProps = {
  displayMode: PdfViewerDisplayMode;
  zoomMode: PdfViewerZoomMode;
  customScale: number;
  searchQuery: string;
  matchCount: number;
  activeMatchIndex: number;
  onDisplayModeChange: (mode: PdfViewerDisplayMode) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onSearchChange: (query: string) => void;
  onPrevMatch: () => void;
  onNextMatch: () => void;
  onClearSearch: () => void;
};
export function PdfViewerToolbar({
  displayMode,
  zoomMode,
  customScale,
  searchQuery,
  matchCount,
  activeMatchIndex,
  onDisplayModeChange,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onSearchChange,
  onPrevMatch,
  onNextMatch,
  onClearSearch,
}: PdfViewerToolbarProps) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
      <div className="inline-flex shrink-0 rounded-lg border border-slate-200 p-0.5">
        <ToolbarButton
          active={displayMode === 'continuous'}
          onClick={() => onDisplayModeChange('continuous')}
          label="Прокрутка"
        />
        <ToolbarButton
          active={displayMode === 'single'}
          onClick={() => onDisplayModeChange('single')}
          label="Страница"
        />
      </div>

      <div className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-1">
        <IconButton label="Уменьшить" onClick={onZoomOut}>
          −
        </IconButton>
        <span className="min-w-[2.5rem] text-center text-[10px] tabular-nums text-slate-600 sm:min-w-[3rem] sm:text-xs">
          {zoomMode === 'fit-width' ? (
            <>
              <span className="sm:hidden">шир.</span>
              <span className="hidden sm:inline">по ширине</span>
            </>
          ) : (
            `${Math.round(customScale * 100)}%`
          )}
        </span>
        <IconButton label="Увеличить" onClick={onZoomIn}>
          +
        </IconButton>
        <IconButton label="Сбросить масштаб" onClick={onResetZoom}>
          ↺
        </IconButton>
      </div>

      <div className="flex min-w-0 w-full basis-full items-center gap-1 sm:basis-auto sm:flex-1">
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Поиск по тексту…"
          className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-folio-400"
        />
        {searchQuery && (
          <>
            <span className="shrink-0 text-xs text-slate-500">
              {matchCount > 0 ? `${activeMatchIndex + 1}/${matchCount}` : 'нет'}
            </span>
            <IconButton
              label="Предыдущее совпадение"
              onClick={onPrevMatch}
              disabled={matchCount === 0}
            >
              ↑
            </IconButton>
            <IconButton
              label="Следующее совпадение"
              onClick={onNextMatch}
              disabled={matchCount === 0}
            >
              ↓
            </IconButton>
            <IconButton label="Очистить поиск" onClick={onClearSearch}>
              ✕
            </IconButton>
          </>
        )}
      </div>
    </div>
  );
}
function ToolbarButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition ${active ? 'bg-folio-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
    >
      {label}
    </button>
  );
}
function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-base text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}
