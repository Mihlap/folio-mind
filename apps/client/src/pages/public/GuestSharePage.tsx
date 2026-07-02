import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react';
import { useParams } from 'react-router-dom';
import {
  createGuestShareComment,
  fetchGuestShareComments,
  fetchGuestShareMeta,
  fetchGuestSharePreviews,
  type GuestShareComment,
} from '@folio-mind/store';

const PREVIEW_BATCH = 20;
const AUTHOR_NAME_KEY = 'folio-guest-author-name';

/** Миниатюры (fallback) не содержат watermark в PNG — накладываем в CSS. */
const THUMB_WATERMARK_MAX_WIDTH = 240;

const WATERMARK_TEXT = 'ТОЛЬКО ПРОСМОТР';
const WATERMARK_ROWS = 6;
const WATERMARK_COLS = 3;

type PagePreview = {
  page: number;
  url: string;
};

type Pin = { x: number; y: number };

function GuestViewWatermark() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="absolute left-1/2 top-1/2 flex w-[220%] -translate-x-1/2 -translate-y-1/2 -rotate-[28deg] flex-col items-stretch justify-center gap-8 py-6 sm:gap-10">
        {Array.from({ length: WATERMARK_ROWS }, (_, row) => (
          <div
            key={row}
            className="flex items-center justify-around gap-6 sm:gap-10"
            style={{ paddingLeft: row % 2 === 0 ? '0' : '8%' }}
          >
            {Array.from({ length: WATERMARK_COLS }, (_, col) => (
              <span
                key={col}
                className="whitespace-nowrap text-center text-2xl font-semibold tracking-[0.12em] text-slate-500/38 sm:text-3xl md:text-[2rem]"
              >
                {WATERMARK_TEXT}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function GuestSharePageImage({
  url,
  page,
  pinMode,
  pin,
  onPin,
}: {
  url: string;
  page: number;
  pinMode: boolean;
  pin: Pin | null;
  onPin: (pin: Pin) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const [needsCssWatermark, setNeedsCssWatermark] = useState(false);

  function handleImageClick(event: MouseEvent<HTMLImageElement>) {
    if (!pinMode) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    onPin({
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    });
  }

  return (
    <div className="relative min-h-[280px] bg-slate-50">
      {!loaded && !errored && (
        <p className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">
          Загрузка страницы…
        </p>
      )}
      {errored ? (
        <p className="flex min-h-[280px] items-center justify-center px-4 text-center text-sm text-slate-500">
          Не удалось загрузить превью страницы {page}
        </p>
      ) : (
        <img
          src={url}
          alt={`Страница ${page}`}
          className={[
            'block w-full select-none transition-opacity duration-300',
            loaded ? 'opacity-100' : 'opacity-0',
            pinMode ? 'cursor-crosshair' : '',
          ].join(' ')}
          draggable={false}
          onClick={handleImageClick}
          onLoad={(event) => {
            setLoaded(true);
            setNeedsCssWatermark(event.currentTarget.naturalWidth <= THUMB_WATERMARK_MAX_WIDTH);
          }}
          onError={() => setErrored(true)}
        />
      )}
      {loaded && !errored && pin && (
        <span
          className="pointer-events-none absolute z-10 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-amber-500 shadow"
          style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }}
          aria-hidden
        />
      )}
      {loaded && !errored && needsCssWatermark && <GuestViewWatermark />}
    </div>
  );
}

function GuestPageComments({
  page,
  comments,
  authorName,
  pin,
  pinMode,
  submitting,
  onTogglePinMode,
  onClearPin,
  onAuthorNameChange,
  onSubmit,
}: {
  page: number;
  comments: GuestShareComment[];
  authorName: string;
  pin: Pin | null;
  pinMode: boolean;
  submitting: boolean;
  onTogglePinMode: () => void;
  onClearPin: () => void;
  onAuthorNameChange: (value: string) => void;
  onSubmit: (content: string) => Promise<void>;
}) {
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    const text = content.trim();
    if (!text) {
      setError('Введите текст замечания');
      return;
    }
    setError(null);
    try {
      await onSubmit(text);
      setContent('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось отправить');
    }
  }

  return (
    <div className="border-t border-slate-100 px-4 py-3">
      {comments.length > 0 && (
        <ul className="mb-3 space-y-2">
          {comments.map((comment) => (
            <li
              key={comment.id}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
            >
              <p className="whitespace-pre-wrap">{comment.content}</p>
              <p className="mt-1 text-[11px] text-slate-500">
                {comment.authorName?.trim() || 'Заказчик'}
                {comment.x != null && comment.y != null ? ' · с меткой на странице' : ''}
              </p>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2">
        <label className="block text-xs text-slate-600">
          Ваше имя (необязательно)
          <input
            type="text"
            value={authorName}
            onChange={(e) => onAuthorNameChange(e.target.value)}
            maxLength={120}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            placeholder="Иван Иванов"
          />
        </label>
        <label className="block text-xs text-slate-600">
          Замечание к стр. {page}
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            maxLength={4000}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            placeholder="Опишите, что нужно исправить на этой странице"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onTogglePinMode}
            className={[
              'cursor-pointer rounded-lg border px-2.5 py-1.5 text-xs font-medium',
              pinMode
                ? 'border-amber-300 bg-amber-50 text-amber-900'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
            ].join(' ')}
          >
            {pinMode ? 'Кликните по странице…' : 'Указать место'}
          </button>
          {pin && (
            <button
              type="button"
              onClick={onClearPin}
              className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
            >
              Сбросить метку
            </button>
          )}
          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleSubmit()}
            className="cursor-pointer rounded-lg bg-folio-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-folio-700 disabled:opacity-60"
          >
            {submitting ? 'Отправка…' : 'Отправить'}
          </button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}

export function GuestSharePage() {
  const { token } = useParams<{ token: string }>();
  const [title, setTitle] = useState<string | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [pages, setPages] = useState<PagePreview[]>([]);
  const [comments, setComments] = useState<GuestShareComment[]>([]);
  const [authorName, setAuthorName] = useState('');
  const [pinByPage, setPinByPage] = useState<Record<number, Pin | null>>({});
  const [pinModePage, setPinModePage] = useState<number | null>(null);
  const [submittingPage, setSubmittingPage] = useState<number | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewStatus, setPreviewStatus] = useState<string | null>(null);
  const [pendingPages, setPendingPages] = useState<number[]>([]);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(AUTHOR_NAME_KEY);
      if (saved) setAuthorName(saved);
    } catch {
    }
  }, []);

  const commentsByPage = useMemo(() => {
    const map = new Map<number, GuestShareComment[]>();
    for (const comment of comments) {
      const list = map.get(comment.page) ?? [];
      list.push(comment);
      map.set(comment.page, list);
    }
    return map;
  }, [comments]);

  const loadedThrough = useMemo(() => {
    if (pages.length === 0) return 0;
    return Math.max(...pages.map((p) => p.page));
  }, [pages]);

  const loadComments = useCallback(async () => {
    if (!token) return;
    const items = await fetchGuestShareComments(token);
    setComments(items);
  }, [token]);

  const loadPreviews = useCallback(
    async (from: number, to: number) => {
      if (!token) return;
      setLoadingMore(true);
      try {
        const result = await fetchGuestSharePreviews(token, from, to);
        setPageCount(result.pageCount);
        setPreviewStatus(result.status);
        setPendingPages(result.pendingPages ?? []);
        setPages((prev) => {
          const byPage = new Map(prev.map((p) => [p.page, p]));
          for (const item of result.pages) {
            byPage.set(item.page, item);
          }
          return [...byPage.values()].sort((a, b) => a.page - b.page);
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Не удалось загрузить превью');
      } finally {
        setLoadingMore(false);
      }
    },
    [token],
  );

  useEffect(() => {
    if (!token) {
      setError('Некорректная ссылка');
      setLoadingMeta(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      setLoadingMeta(true);
      setError(null);
      try {
        const meta = await fetchGuestShareMeta(token);
        if (cancelled) return;
        setTitle(meta.title);
        setVersion(meta.version);
        setExpiresAt(meta.expiresAt);
        setPreviewStatus(meta.previewStatus);
        const count = meta.pageCount ?? 0;
        setPageCount(count);
        await loadComments();
        if (count > 0) {
          await loadPreviews(1, Math.min(PREVIEW_BATCH, count));
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Ссылка недоступна');
        }
      } finally {
        if (!cancelled) setLoadingMeta(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, loadPreviews, loadComments]);

  useEffect(() => {
    if (!token || error) return;
    const shouldPoll =
      previewStatus === 'processing' ||
      previewStatus === 'partial' ||
      pendingPages.length > 0 ||
      (pageCount > 0 && pages.length === 0);
    if (!shouldPoll) return;

    const timer = window.setInterval(() => {
      const to = pageCount > 0 ? Math.min(PREVIEW_BATCH, pageCount) : PREVIEW_BATCH;
      void loadPreviews(1, to);
    }, 3000);

    return () => window.clearInterval(timer);
  }, [
    token,
    error,
    previewStatus,
    pendingPages.length,
    pageCount,
    loadedThrough,
    pages.length,
    loadPreviews,
  ]);

  function handleAuthorNameChange(value: string) {
    setAuthorName(value);
    try {
      sessionStorage.setItem(AUTHOR_NAME_KEY, value);
    } catch {
    }
  }

  async function handleSubmitComment(page: number, content: string) {
    if (!token) return;
    setSubmittingPage(page);
    try {
      const pin = pinByPage[page] ?? null;
      const created = await createGuestShareComment(token, {
        page,
        content,
        authorName: authorName.trim() || undefined,
        x: pin?.x,
        y: pin?.y,
      });
      setComments((prev) => [...prev, created].sort((a, b) => a.page - b.page || a.createdAt.localeCompare(b.createdAt)));
      setPinByPage((prev) => ({ ...prev, [page]: null }));
      setPinModePage(null);
    } finally {
      setSubmittingPage(null);
    }
  }

  const handleLoadMore = () => {
    if (pageCount <= loadedThrough || loadingMore) return;
    const from = loadedThrough + 1;
    const to = Math.min(pageCount, from + PREVIEW_BATCH - 1);
    void loadPreviews(from, to);
  };

  const expiresLabel = expiresAt
    ? new Date(expiresAt).toLocaleString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Просмотр для согласования
          </p>
          {loadingMeta ? (
            <h1 className="mt-1 text-lg font-semibold text-slate-800">Загрузка…</h1>
          ) : error ? (
            <h1 className="mt-1 text-lg font-semibold text-slate-800">Ссылка недоступна</h1>
          ) : (
            <>
              <h1 className="mt-1 text-lg font-semibold text-slate-900">{title}</h1>
              <p className="mt-1 text-sm text-slate-600">
                Версия v{version}
                {pageCount > 0 ? ` · ${pageCount} стр.` : ''}
                {expiresLabel ? ` · действует до ${expiresLabel}` : ''}
              </p>
            </>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </div>
        )}

        {!error && previewStatus === 'processing' && pages.length === 0 && (
          <p className="text-sm text-slate-600">Документ обрабатывается, превью появятся позже.</p>
        )}

        {!error && previewStatus === 'unavailable' && (
          <p className="text-sm text-slate-600">Превью для этой версии пока недоступны.</p>
        )}

        {!error && pageCount > 0 && pages.length === 0 && (
          <p className="mb-4 text-sm text-slate-600">
            {loadingMore || previewStatus === 'partial' || previewStatus === 'processing'
              ? 'Готовим превью страниц… Обычно это занимает до минуты.'
              : 'Превью пока недоступны. Обновите страницу через минуту.'}
          </p>
        )}

        {!error && previewStatus === 'partial' && pages.length > 0 && pendingPages.length > 0 && (
          <p className="mb-4 text-sm text-slate-600">
            Загружаем оставшиеся страницы ({pages.length} из {pageCount})…
          </p>
        )}

        {!error && pages.length > 0 && (
          <p className="mb-4 text-sm text-slate-600">
            Оставьте замечание к любой странице — автор документа увидит его в панели согласования.
          </p>
        )}

        <div className="space-y-6">
          {pages.map((item) => (
            <figure
              key={item.page}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
            >
              <figcaption className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
                Страница {item.page}
                {pageCount > 0 ? ` из ${pageCount}` : ''}
              </figcaption>
              <GuestSharePageImage
                url={item.url}
                page={item.page}
                pinMode={pinModePage === item.page}
                pin={pinByPage[item.page] ?? null}
                onPin={(pin) => {
                  setPinByPage((prev) => ({ ...prev, [item.page]: pin }));
                  setPinModePage(null);
                }}
              />
              <GuestPageComments
                page={item.page}
                comments={commentsByPage.get(item.page) ?? []}
                authorName={authorName}
                pin={pinByPage[item.page] ?? null}
                pinMode={pinModePage === item.page}
                submitting={submittingPage === item.page}
                onTogglePinMode={() =>
                  setPinModePage((prev) => (prev === item.page ? null : item.page))
                }
                onClearPin={() => setPinByPage((prev) => ({ ...prev, [item.page]: null }))}
                onAuthorNameChange={handleAuthorNameChange}
                onSubmit={(content) => handleSubmitComment(item.page, content)}
              />
            </figure>
          ))}
        </div>

        {!error && loadedThrough > 0 && pageCount > loadedThrough && (
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
            >
              {loadingMore ? 'Загрузка…' : `Показать ещё (${loadedThrough}/${pageCount})`}
            </button>
          </div>
        )}

        <p className="mt-8 text-center text-xs text-slate-400">
          Скачивание исходного PDF отключено. Для правок свяжитесь с отправителем ссылки.
        </p>
      </main>
    </div>
  );
}
