import { Link } from 'react-router-dom';
import { useBackgroundUpload } from '../../context/background-upload-provider.js';
import { getUploadStage } from '../../lib/uploads/uploadStage.js';

export function BackgroundUploadBanner() {
  const { active, progress, fileLabel, showDone, error, clearError, kind } = useBackgroundUpload();

  if (kind === 'regulation') return null;

  if (!active && !error) return null;

  return (
    <div
      className="shrink-0 border-b border-slate-200 bg-white px-3 py-2 sm:px-4"
      role="status"
      aria-live="polite"
    >
      {active && (
        <div className="mx-auto flex max-w-3xl flex-col gap-1.5">
          <div className="flex items-center justify-between gap-3 text-xs text-slate-600 sm:text-sm">
            <span className="min-w-0 truncate" title={fileLabel}>
              {showDone && progress === 100
                ? `✓ Загружено: ${fileLabel}`
                : `Загрузка: ${fileLabel}`}
            </span>
            <span className="shrink-0 tabular-nums">{progress}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full bg-folio-600 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-500">
            {showDone && progress === 100
              ? 'Можно продолжать работу — файл обрабатывается в фоне.'
              : getUploadStage(progress)}
          </p>
        </div>
      )}
      {error && (
        <div className="mx-auto flex max-w-3xl items-start justify-between gap-3">
          <p className="min-w-0 flex-1 break-words text-sm text-red-600">{error}</p>
          <button
            type="button"
            onClick={clearError}
            className="shrink-0 cursor-pointer text-xs text-slate-500 hover:text-slate-700"
          >
            Закрыть
          </button>
        </div>
      )}
      {!active && error && (
        <p className="mx-auto mt-1 max-w-3xl text-xs text-slate-500">
          <Link to="/app" className="text-folio-600 hover:underline">
            Вернуться к документам
          </Link>
        </p>
      )}
    </div>
  );
}
