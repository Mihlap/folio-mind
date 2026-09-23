import { Link, useLocation } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { useBackgroundUpload } from '../../context/useBackgroundUpload.js';

export function BackgroundUploadBanner() {
  const location = useLocation();
  const { active, error, clearError, kind } = useBackgroundUpload();
  const pathRef = useRef(location.pathname);

  useEffect(() => {
    if (pathRef.current !== location.pathname) {
      pathRef.current = location.pathname;
      if (error && !active) clearError();
    }
  }, [location.pathname, error, active, clearError]);

  if (kind === 'regulation') return null;
  if (!error) return null;

  const onDocumentsPage =
    location.pathname === '/app' || location.pathname.startsWith('/app/documents/');

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
      {!active && !onDocumentsPage && (
        <p className="mx-auto mt-1 max-w-3xl text-xs text-slate-500">
          <Link to="/app" className="text-folio-600 hover:underline">
            Перейти к документам
          </Link>
          {' · '}
          документ мог создаться со статусом «не загружен» — проверьте список
        </p>
      )}
    </div>
  );
}
