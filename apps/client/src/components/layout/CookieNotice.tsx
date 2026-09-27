import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { dismissStorageNotice, isStorageNoticeDismissed } from './storageNotice.js';

export function CookieNotice() {
  const location = useLocation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isStorageNoticeDismissed()) return;
    setVisible(true);
  }, []);

  const dismiss = useCallback(() => {
    dismissStorageNotice();
    setVisible(false);
  }, []);

  if (!visible) return null;
  if (location.pathname.startsWith('/app')) return null;

  return (
    <div
      role="region"
      aria-label="Использование файлов cookie и локального хранилища"
      className="fixed inset-x-0 bottom-0 z-40 animate-[notice-rise_0.28s_ease-out] motion-reduce:[animation:none] pb-[env(safe-area-inset-bottom)]"
    >
      <div className="border-t border-slate-200 bg-white/95 px-4 py-4 shadow-[0_-12px_32px_-24px_rgba(30,27,75,0.45)] backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">
              Мы используем файлы cookie и локальное хранилище
            </p>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              Сервис сохраняет в браузере только те данные, которые нужны для входа и работы с
              документами. Рекламных и аналитических трекеров нет.{' '}
              <Link
                to="/privacy"
                className="whitespace-nowrap font-medium text-folio-600 hover:underline"
              >
                Политика конфиденциальности
              </Link>
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="min-h-11 shrink-0 cursor-pointer rounded-2xl bg-folio-600 px-6 text-sm font-medium text-white shadow-md shadow-folio-600/25 transition hover:bg-folio-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-folio-500 focus-visible:ring-offset-2"
          >
            Понятно
          </button>
        </div>
      </div>
    </div>
  );
}
