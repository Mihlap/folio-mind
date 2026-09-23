import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useParams } from 'react-router-dom';
import {
  LABEL_GUEST_AUTHOR_REPLY,
  LABEL_GUEST_COMMENT_RESOLVED_GUEST,
  LABEL_GUEST_PAGE_NEEDS_FIX,
  LABEL_GUEST_PAGE_OK,
  MSG_GUEST_PAGE_NEEDS_FIX,
  createGuestShareComment,
  fetchGuestShareComments,
  fetchGuestShareMeta,
  fetchGuestSharePreviews,
  fetchGuestSharePageReviewMarks,
  fetchGuestShareBookletDownload,
  GuestSharePasswordRequiredError,
  type GuestShareComment,
  type GuestSharePageReviewMark,
} from '@folio-mind/store';
import { pageReviewMarksByPage } from '../../lib/documents/pageReviewMarkers.js';
import { useGuestShareEvents } from '../../hooks/useGuestShareEvents.js';
import { PasswordInput } from '../../components/auth/PasswordInput.js';

const PREVIEW_BATCH = 20;
const AUTHOR_NAME_KEY = 'folio-guest-author-name';
const AUTHOR_EMAIL_KEY = 'folio-guest-author-email';

function sharePasswordKey(token: string): string {
  return `folio-share-pwd:${token}`;
}

const THUMB_WATERMARK_MAX_WIDTH = 240;

const WATERMARK_TEXT = 'ТОЛЬКО ПРОСМОТР';
const WATERMARK_ROWS = 5;
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
                className="whitespace-nowrap text-center text-xl font-medium tracking-[0.1em] text-slate-400/15 sm:text-2xl md:text-[1.65rem]"
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
  authorEmail,
  pin,
  pinMode,
  submitting,
  onTogglePinMode,
  onClearPin,
  onAuthorNameChange,
  onAuthorEmailChange,
  onSubmit,
}: {
  page: number;
  comments: GuestShareComment[];
  authorName: string;
  authorEmail: string;
  pin: Pin | null;
  pinMode: boolean;
  submitting: boolean;
  onTogglePinMode: () => void;
  onClearPin: () => void;
  onAuthorNameChange: (value: string) => void;
  onAuthorEmailChange: (value: string) => void;
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
    if (authorEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(authorEmail.trim())) {
      setError('Введите почту правильно');
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
          {comments.map((comment) => {
            const isResolved = comment.status === 'resolved';
            return (
              <li
                key={comment.id}
                className={[
                  'rounded-lg border px-3 py-2 text-sm',
                  isResolved
                    ? 'border-emerald-200 bg-emerald-50/80 text-slate-800'
                    : 'border-slate-200 bg-slate-50 text-slate-800',
                ].join(' ')}
              >
                {isResolved && (
                  <p className="mb-1.5 inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-900">
                    {LABEL_GUEST_COMMENT_RESOLVED_GUEST}
                  </p>
                )}
                <p className="whitespace-pre-wrap">{comment.content}</p>
                {isResolved && comment.authorReply && (
                  <div className="mt-2 rounded-md border border-emerald-200 bg-white px-2.5 py-2 text-xs">
                    <p className="font-medium text-emerald-800">{LABEL_GUEST_AUTHOR_REPLY}</p>
                    <p className="mt-1 whitespace-pre-wrap leading-relaxed text-slate-700">
                      {comment.authorReply}
                    </p>
                  </div>
                )}
                <p className="mt-1 text-[11px] text-slate-500">
                  {comment.authorName?.trim() || 'Заказчик'}
                  {comment.x != null && comment.y != null && !isResolved
                    ? ' · с меткой на странице'
                    : ''}
                  {isResolved && comment.resolvedAt
                    ? ` · исправлено ${new Date(comment.resolvedAt).toLocaleString('ru-RU', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}`
                    : ''}
                </p>
              </li>
            );
          })}
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
          Email для ответа (необязательно)
          <input
            type="email"
            value={authorEmail}
            onChange={(e) => onAuthorEmailChange(e.target.value)}
            maxLength={320}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            placeholder="you@example.com"
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
  const [authorEmail, setAuthorEmail] = useState('');
  const [pinByPage, setPinByPage] = useState<Record<number, Pin | null>>({});
  const [pinModePage, setPinModePage] = useState<number | null>(null);
  const [submittingPage, setSubmittingPage] = useState<number | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewStatus, setPreviewStatus] = useState<string | null>(null);
  const [pendingPages, setPendingPages] = useState<number[]>([]);
  const [sharePassword, setSharePassword] = useState<string | null>(null);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [passwordDraft, setPasswordDraft] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [allowBookletZip, setAllowBookletZip] = useState(false);
  const [bookletZipAvailable, setBookletZipAvailable] = useState(false);
  const [bookletDownloadBusy, setBookletDownloadBusy] = useState(false);
  const [bookletDownloadError, setBookletDownloadError] = useState<string | null>(null);
  const [pageReviewMarks, setPageReviewMarks] = useState<GuestSharePageReviewMark[]>([]);
  const sharePasswordRef = useRef<string | null>(null);
  const loadShareSeqRef = useRef(0);

  sharePasswordRef.current = sharePassword;

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(AUTHOR_NAME_KEY);
      if (saved) setAuthorName(saved);
      const savedEmail = sessionStorage.getItem(AUTHOR_EMAIL_KEY);
      if (savedEmail) setAuthorEmail(savedEmail);
    } catch {
      // Session storage is optional for guest author hints.
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    try {
      const saved = sessionStorage.getItem(sharePasswordKey(token));
      if (saved) setSharePassword(saved);
    } catch {
      // Session storage is optional; the guest can re-enter the password.
    }
  }, [token]);

  const resolveSharePassword = useCallback(
    (pwd?: string | null) => pwd ?? sharePasswordRef.current,
    [],
  );

  const commentsByPage = useMemo(() => {
    const map = new Map<number, GuestShareComment[]>();
    for (const comment of comments) {
      const list = map.get(comment.page) ?? [];
      list.push(comment);
      map.set(comment.page, list);
    }
    return map;
  }, [comments]);

  const reviewMarkByPage = useMemo(() => pageReviewMarksByPage(pageReviewMarks), [pageReviewMarks]);

  const pagesNeedingFix = useMemo(
    () => pageReviewMarks.filter((m) => m.status === 'needs_fix').map((m) => m.page),
    [pageReviewMarks],
  );

  const loadedThrough = useMemo(() => {
    if (pages.length === 0) return 0;
    return Math.max(...pages.map((p) => p.page));
  }, [pages]);

  const loadComments = useCallback(
    async (pwd?: string | null) => {
      if (!token) return;
      const items = await fetchGuestShareComments(token, resolveSharePassword(pwd));
      setComments(items);
    },
    [token, resolveSharePassword],
  );

  const loadPageReviewMarks = useCallback(
    async (pwd?: string | null) => {
      if (!token) return;
      try {
        const marks = await fetchGuestSharePageReviewMarks(token, resolveSharePassword(pwd));
        setPageReviewMarks(marks.items);
      } catch {
        setPageReviewMarks([]);
      }
    },
    [token, resolveSharePassword],
  );

  const loadPreviews = useCallback(
    async (from: number, to: number, pwd?: string | null) => {
      if (!token) return;
      setLoadingMore(true);
      try {
        const result = await fetchGuestSharePreviews(token, from, to, resolveSharePassword(pwd));
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
        if (err instanceof GuestSharePasswordRequiredError) {
          throw err;
        }
        setError(err instanceof Error ? err.message : 'Не удалось загрузить превью');
      } finally {
        setLoadingMore(false);
      }
    },
    [token, resolveSharePassword],
  );

  const loadShare = useCallback(
    async (pwd?: string | null): Promise<boolean> => {
      if (!token) {
        setError('Некорректная ссылка');
        setLoadingMeta(false);
        return false;
      }

      const requestSeq = ++loadShareSeqRef.current;
      const effectivePwd = resolveSharePassword(pwd);

      setLoadingMeta(true);
      setError(null);
      if (pwd !== undefined) {
        setPasswordError(null);
      }

      try {
        const meta = await fetchGuestShareMeta(token, effectivePwd);
        if (requestSeq !== loadShareSeqRef.current) return false;

        setNeedsPassword(false);
        setTitle(meta.title);
        setVersion(meta.version);
        setExpiresAt(meta.expiresAt);
        setAllowBookletZip(meta.allowBookletZip);
        setBookletZipAvailable(meta.bookletZipAvailable);
        setPreviewStatus(meta.previewStatus);
        const count = meta.pageCount ?? 0;
        setPageCount(count);

        await loadComments(effectivePwd);
        if (requestSeq !== loadShareSeqRef.current) return false;

        await loadPageReviewMarks(effectivePwd);
        if (requestSeq !== loadShareSeqRef.current) return false;

        if (count > 0) {
          await loadPreviews(1, Math.min(PREVIEW_BATCH, count), effectivePwd);
          if (requestSeq !== loadShareSeqRef.current) return false;
        }

        return true;
      } catch (err) {
        if (requestSeq !== loadShareSeqRef.current) return false;

        if (err instanceof GuestSharePasswordRequiredError) {
          setNeedsPassword(true);
          setError(null);
          if (effectivePwd) {
            setPasswordError('Неверный пароль');
          }
          return false;
        }

        setError(err instanceof Error ? err.message : 'Ссылка недоступна');
        return false;
      } finally {
        if (requestSeq === loadShareSeqRef.current) {
          setLoadingMeta(false);
        }
      }
    },
    [token, resolveSharePassword, loadComments, loadPageReviewMarks, loadPreviews],
  );

  useEffect(() => {
    if (!token) return;
    let savedPwd: string | null = null;
    try {
      savedPwd = sessionStorage.getItem(sharePasswordKey(token));
    } catch {
      savedPwd = null;
    }
    void loadShare(savedPwd);
  }, [token, loadShare]);

  useEffect(() => {
    if (!token || error || needsPassword) return;

    function syncGuestUpdates() {
      if (document.visibilityState !== 'visible') return;
      void loadComments();
      void loadPageReviewMarks();
    }

    syncGuestUpdates();
  }, [token, error, needsPassword, loadComments, loadPageReviewMarks]);

  useGuestShareEvents({
    token,
    sharePassword,
    enabled: Boolean(token && !error && !needsPassword),
    onGuestComment: () => void loadComments(),
    onPageReview: () => void loadPageReviewMarks(),
  });

  useEffect(() => {
    if (!token || error || needsPassword) return;
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
    needsPassword,
  ]);

  function handleAuthorNameChange(value: string) {
    setAuthorName(value);
    try {
      sessionStorage.setItem(AUTHOR_NAME_KEY, value);
    } catch {
      // Session storage is optional for guest author hints.
    }
  }

  function handleAuthorEmailChange(value: string) {
    setAuthorEmail(value);
    try {
      sessionStorage.setItem(AUTHOR_EMAIL_KEY, value);
    } catch {
      // Session storage is optional for guest author hints.
    }
  }

  async function handleSubmitComment(page: number, content: string) {
    if (!token) return;
    setSubmittingPage(page);
    try {
      const pin = pinByPage[page] ?? null;
      const created = await createGuestShareComment(
        token,
        {
          page,
          content,
          authorName: authorName.trim() || undefined,
          authorEmail: authorEmail.trim() || undefined,
          x: pin?.x,
          y: pin?.y,
        },
        sharePassword,
      );
      setComments((prev) =>
        [...prev, created].sort(
          (a, b) => a.page - b.page || a.createdAt.localeCompare(b.createdAt),
        ),
      );
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

  async function handleUnlockPassword() {
    if (!token) return;
    const pwd = passwordDraft.trim();
    if (!pwd) {
      setPasswordError('Введите пароль');
      return;
    }
    setUnlocking(true);
    setPasswordError(null);
    try {
      try {
        sessionStorage.setItem(sharePasswordKey(token), pwd);
      } catch {
        // Session storage is optional; keep the password only in component state.
      }
      setSharePassword(pwd);
      const unlocked = await loadShare(pwd);
      if (!unlocked) {
        try {
          sessionStorage.removeItem(sharePasswordKey(token));
        } catch {
          // Session storage is optional.
        }
        setSharePassword(null);
      }
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Неверный пароль');
    } finally {
      setUnlocking(false);
    }
  }

  async function handleDownloadBookletZip() {
    if (!token || !bookletZipAvailable) return;
    setBookletDownloadBusy(true);
    setBookletDownloadError(null);
    try {
      const result = await fetchGuestShareBookletDownload(token, sharePassword);
      window.open(result.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setBookletDownloadError(
        err instanceof Error
          ? err.message
          : 'Не удалось скачать пакет. Попробуйте позже или обратитесь к отправителю.',
      );
    } finally {
      setBookletDownloadBusy(false);
    }
  }

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
          ) : needsPassword && !error ? (
            <h1 className="mt-1 text-lg font-semibold text-slate-800">Просмотр для согласования</h1>
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
              {allowBookletZip && (
                <div className="mt-3">
                  {bookletZipAvailable ? (
                    <button
                      type="button"
                      disabled={bookletDownloadBusy}
                      onClick={() => void handleDownloadBookletZip()}
                      className="cursor-pointer rounded-lg bg-folio-600 px-4 py-2 text-sm font-medium text-white hover:bg-folio-700 disabled:opacity-60"
                    >
                      {bookletDownloadBusy ? 'Подготовка…' : 'Скачать пакет (ZIP)'}
                    </button>
                  ) : (
                    <p className="text-xs text-slate-500">
                      Пакет для скачивания ещё не собран — попросите отправителя подготовить ZIP в
                      разделе «Буклет».
                    </p>
                  )}
                  {bookletDownloadError && (
                    <p className="mt-1 text-xs text-red-600">{bookletDownloadError}</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        {needsPassword && !error && (
          <div className="mx-auto max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">Доступ по паролю</h2>
            <p className="mt-1 text-sm text-slate-600">
              Владелец документа защитил ссылку паролем. Введите его, чтобы открыть превью.
            </p>
            <PasswordInput
              label="Пароль"
              value={passwordDraft}
              onChange={setPasswordDraft}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleUnlockPassword();
              }}
              autoFocus
            />
            {passwordError && <p className="mt-2 text-xs text-red-600">{passwordError}</p>}
            <button
              type="button"
              disabled={unlocking}
              onClick={() => void handleUnlockPassword()}
              className="mt-4 w-full cursor-pointer rounded-lg bg-folio-600 px-3 py-2 text-sm font-medium text-white hover:bg-folio-700 disabled:opacity-60"
            >
              {unlocking ? 'Проверка…' : 'Открыть'}
            </button>
          </div>
        )}

        {error && !needsPassword && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </div>
        )}

        {!needsPassword && !error && previewStatus === 'processing' && pages.length === 0 && (
          <p className="text-sm text-slate-600">Документ обрабатывается, превью появятся позже.</p>
        )}

        {!needsPassword && !error && previewStatus === 'unavailable' && (
          <p className="text-sm text-slate-600">Превью для этой версии пока недоступны.</p>
        )}

        {!needsPassword && !error && pageCount > 0 && pages.length === 0 && (
          <p className="mb-4 text-sm text-slate-600">
            {loadingMore || previewStatus === 'partial' || previewStatus === 'processing'
              ? 'Готовим превью страниц… Обычно это занимает до минуты.'
              : 'Превью пока недоступны. Обновите страницу через минуту.'}
          </p>
        )}

        {!needsPassword &&
          !error &&
          previewStatus === 'partial' &&
          pages.length > 0 &&
          pendingPages.length > 0 && (
            <p className="mb-4 text-sm text-slate-600">
              Загружаем оставшиеся страницы ({pages.length} из {pageCount})…
            </p>
          )}

        {!needsPassword && !error && pages.length > 0 && (
          <p className="mb-4 text-sm text-slate-600">
            Оставьте замечание к любой странице — автор документа увидит его в панели согласования.
          </p>
        )}

        {!needsPassword && !error && pagesNeedingFix.length > 0 && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <p className="font-medium">Отправитель просит проверить страницы</p>
            <p className="mt-1 text-xs leading-relaxed text-amber-900">
              Нужны правки: {pagesNeedingFix.map((page) => `стр. ${page}`).join(', ')}. Ниже на этих
              листах — жёлтый баннер с пояснением.
            </p>
          </div>
        )}

        {!needsPassword && (
          <div className="space-y-6">
            {pages.map((item) => {
              const reviewStatus = reviewMarkByPage[item.page];
              return (
                <figure
                  key={item.page}
                  className={[
                    'overflow-hidden rounded-xl border bg-white shadow-sm',
                    reviewStatus === 'needs_fix' ? 'border-amber-300' : 'border-slate-200',
                  ].join(' ')}
                >
                  <figcaption className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
                    <span>
                      Страница {item.page}
                      {pageCount > 0 ? ` из ${pageCount}` : ''}
                    </span>
                    {reviewStatus === 'needs_fix' && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                        {LABEL_GUEST_PAGE_NEEDS_FIX}
                      </span>
                    )}
                    {reviewStatus === 'ok' && (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
                        {LABEL_GUEST_PAGE_OK}
                      </span>
                    )}
                  </figcaption>
                  {reviewStatus === 'needs_fix' && (
                    <div className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs leading-relaxed text-amber-950">
                      {MSG_GUEST_PAGE_NEEDS_FIX}
                    </div>
                  )}
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
                    authorEmail={authorEmail}
                    pin={pinByPage[item.page] ?? null}
                    pinMode={pinModePage === item.page}
                    submitting={submittingPage === item.page}
                    onTogglePinMode={() =>
                      setPinModePage((prev) => (prev === item.page ? null : item.page))
                    }
                    onClearPin={() => setPinByPage((prev) => ({ ...prev, [item.page]: null }))}
                    onAuthorNameChange={handleAuthorNameChange}
                    onAuthorEmailChange={handleAuthorEmailChange}
                    onSubmit={(content) => handleSubmitComment(item.page, content)}
                  />
                </figure>
              );
            })}
          </div>
        )}

        {!needsPassword && !error && loadedThrough > 0 && pageCount > loadedThrough && (
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
