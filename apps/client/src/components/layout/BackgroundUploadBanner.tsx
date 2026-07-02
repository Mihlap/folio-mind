import { Link } from 'react-router-dom';
import { useBackgroundUpload } from '../../context/background-upload-provider.js';

/** Только ошибки фоновой загрузки — прогресс показывается на странице, где начали upload. */
export function BackgroundUploadBanner() {
  const { active, error, clearError, kind } = useBackgroundUpload();

  if (kind === 'regulation') return null;
  if (!error) return null;

  return (
    <div
      className="shrink-0 border-b border-slate-200 bg-white px-3 py-2 sm:px-4"
      role="alert"
      aria-live="assertive"
    >
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
      {!active && (
        <p className="mx-auto mt-1 max-w-3xl text-xs text-slate-500">
          <Link to="/app" className="text-folio-600 hover:underline">
            Вернуться к документам
          </Link>
        </p>
      )}
    </div>
  );
}
