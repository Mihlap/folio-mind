import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FeatureHelpButton } from '../../components/ui/FeatureHelp.js';
import { useBackgroundUpload } from '../../context/useBackgroundUpload.js';
import { useAppSelector } from '../../hooks/index.js';
import {
  clearRegulationsSearchDraft,
  loadRegulationsSearchDraft,
  saveRegulationsSearchDraft,
  type RegulationsSearchHit,
} from '../../lib/documents/regulations-search-draft.js';
import { getUploadStage } from '../../lib/uploads/uploadStage.js';
import {
  useDeleteRagSourceMutation,
  useListRagSourcesQuery,
  useQueryRagMutation,
  useReindexRagSourceMutation,
  VERSION_STATUS_LABELS,
} from '@folio-mind/store';

const STATUS_LABEL: Record<string, string> = {
  pending_upload: 'ожидает файл',
  processing: VERSION_STATUS_LABELS.processing,
  ready: 'готов к проверке',
  failed: 'ошибка',
};

export function RegulationsPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(
    () => loadRegulationsSearchDraft()?.query ?? '',
  );
  const [searchHits, setSearchHits] = useState<RegulationsSearchHit[] | null>(
    () => loadRegulationsSearchDraft()?.hits ?? null,
  );
  const [searchCollapsed, setSearchCollapsed] = useState(
    () => loadRegulationsSearchDraft()?.collapsed ?? false,
  );
  const [searchError, setSearchError] = useState<string | null>(null);
  const { data, refetch } = useListRagSourcesQuery(undefined, { pollingInterval: 5000 });
  const [deleteSource] = useDeleteRagSourceMutation();
  const [reindexSource, { isLoading: reindexing }] = useReindexRagSourceMutation();
  const [queryRag, { isLoading: searching }] = useQueryRagMutation();
  const uploadState = useAppSelector((s) => s.backgroundUpload);
  const { error: uploadError, clearError, uploadRegulation, fileLabel } = useBackgroundUpload();

  const uploading = uploadState.active && uploadState.kind === 'regulation';
  const progress = uploading ? uploadState.progress : 0;
  const showDone = uploading && uploadState.showDone;
  const displayError = localError ?? (uploadState.kind === 'regulation' ? uploadError : null);
  const hasReadySource = data?.items.some((item) => item.status === 'ready') ?? false;

  useEffect(() => {
    if (searchHits == null) return;
    saveRegulationsSearchDraft({
      query: searchQuery,
      hits: searchHits,
      collapsed: searchCollapsed,
    });
  }, [searchQuery, searchHits, searchCollapsed]);

  function handleFile(file: File) {
    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.pdf') && !lower.endsWith('.txt')) {
      setLocalError('Поддерживаются PDF и TXT');
      return;
    }
    setLocalError(null);
    clearError();
    uploadRegulation(file, () => {
      void refetch();
    });
    if (inputRef.current) inputRef.current.value = '';
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q || searching) return;
    setSearchError(null);
    try {
      const result = await queryRag({ query: q, limit: 8 }).unwrap();
      setSearchHits(result.chunks);
      setSearchCollapsed(false);
    } catch (err) {
      setSearchHits(null);
      clearRegulationsSearchDraft();
      setSearchError(err instanceof Error ? err.message : 'Не удалось выполнить поиск');
    }
  }

  function handleDismissSearch() {
    setSearchHits(null);
    setSearchCollapsed(false);
    setSearchError(null);
    clearRegulationsSearchDraft();
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">Регламенты</h1>
          <FeatureHelpButton title="Раздел «Регламенты»">
            <p>
              Сюда загружают внутренние правила, типовые договоры и шаблоны формулировок вашей
              компании.
            </p>
            <p>
              После загрузки система читает файл и сохраняет его по частям. Эти части используются
              на странице документа в блоке «Сверка с регламентом»: там договор сравнивается с
              вашими стандартами, и вы видите, где текст расходится с принятыми у вас правилами.
            </p>
            <p>Файлы видят только пользователи вашей организации.</p>
          </FeatureHelpButton>
        </div>
        <Link to="/app" className="text-sm text-folio-600 hover:underline">
          ← Документы
        </Link>
      </div>

      <p className="mb-4 max-w-2xl text-sm text-slate-600">
        Загрузите PDF или TXT с вашими правилами и шаблонами. Когда статус файла станет «готов», его
        можно использовать при проверке договоров на странице документа.
      </p>

      <div className="max-w-xl rounded-2xl border border-dashed border-slate-300 bg-white p-5">
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.txt,application/pdf,text/plain"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="cursor-pointer rounded-lg bg-folio-600 px-4 py-2 text-sm font-medium text-white hover:bg-folio-700 disabled:opacity-50"
        >
          {uploading ? `Загрузка ${progress}%…` : 'Загрузить PDF или TXT'}
        </button>

        {uploading && (
          <div className="mt-5 space-y-2">
            <p className="truncate text-sm text-slate-700" title={fileLabel}>
              {showDone && progress === 100 ? `✓ ${fileLabel}` : fileLabel}
            </p>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full bg-folio-600 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-slate-500">
              {showDone && progress === 100
                ? 'Файл загружен — идёт индексация регламента'
                : `${progress}% · ${getUploadStage(progress)}`}
            </p>
          </div>
        )}

        {displayError && <p className="mt-3 break-words text-sm text-red-600">{displayError}</p>}
      </div>

      <section className="mt-8 max-w-2xl rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-slate-900">Поиск по регламентам</h2>
        <p className="mt-1 text-xs text-slate-500">
          Найдите фрагменты правил по смыслу или ключевым словам. Нужен хотя бы один файл со
          статусом «готов». Результаты сохраняются до закрытия вкладки браузера.
        </p>
        <form
          onSubmit={(e) => void handleSearch(e)}
          className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-stretch"
        >
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Например: срок оплаты, гарантийные обязательства…"
            disabled={!hasReadySource || searching}
            className="min-w-0 flex-1 rounded-lg border border-slate-200/90 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-300 focus:ring-1 focus:ring-slate-200/70 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!hasReadySource || searching || !searchQuery.trim()}
            className="shrink-0 cursor-pointer rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {searching ? 'Ищем…' : 'Найти'}
          </button>
        </form>
        {!hasReadySource && (
          <p className="mt-2 text-xs text-slate-400">
            Загрузите и дождитесь статуса «готов», чтобы искать по текстам.
          </p>
        )}
        {searchError && <p className="mt-2 text-sm text-red-600">{searchError}</p>}
        {searchHits && (
          <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium text-slate-600">
                Результаты
                {searchQuery.trim() ? `: «${searchQuery.trim()}»` : ''}
                {` · ${searchHits.length}`}
                {searchCollapsed ? ' · свёрнуто' : ''}
              </p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setSearchCollapsed((prev) => !prev)}
                  className="cursor-pointer rounded px-2 py-0.5 text-xs text-slate-600 hover:bg-white"
                >
                  {searchCollapsed ? 'Развернуть' : 'Свернуть'}
                </button>
                <button
                  type="button"
                  title="Удалить результаты поиска"
                  aria-label="Удалить результаты поиска"
                  onClick={handleDismissSearch}
                  className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-lg text-slate-400 hover:bg-white hover:text-slate-600"
                >
                  ✕
                </button>
              </div>
            </div>
            {!searchCollapsed && (
              <ul className="mt-3 space-y-3">
                {searchHits.length === 0 && (
                  <li className="text-sm text-slate-400">Ничего не найдено по этому запросу</li>
                )}
                {searchHits.map((hit) => (
                  <li
                    key={hit.id}
                    className="rounded-xl border border-slate-100 bg-white px-3 py-2.5"
                  >
                    <p className="text-xs font-medium text-slate-600">
                      {hit.sourceTitle}
                      <span className="font-normal text-slate-400">
                        {' '}
                        · фрагмент {hit.chunkIndex + 1}
                      </span>
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                      {hit.content.length > 500 ? `${hit.content.slice(0, 500)}…` : hit.content}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <ul className="mt-8 max-w-2xl space-y-2">
        {data?.items.map((item) => (
          <li
            key={item.id}
            className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:gap-3"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-slate-900">{item.title}</p>
              <p className="text-xs text-slate-500">
                {STATUS_LABEL[item.status] ?? item.status}
                {item.chunkCount > 0 ? ` · ${item.chunkCount} фрагм.` : ''}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {(item.status === 'ready' || item.status === 'failed') && (
                <button
                  type="button"
                  disabled={uploading || reindexing}
                  onClick={async () => {
                    try {
                      setLocalError(null);
                      await reindexSource(item.id).unwrap();
                      await refetch();
                    } catch (err) {
                      setLocalError(
                        err instanceof Error ? err.message : 'Не удалось переиндексировать',
                      );
                    }
                  }}
                  className="cursor-pointer rounded-lg px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                  title="Пересобрать индекс (нужно после обновления embeddings)"
                >
                  Переиндексировать
                </button>
              )}
              <button
                type="button"
                disabled={uploading}
                onClick={async () => {
                  if (!window.confirm(`Удалить «${item.title}»?`)) return;
                  await deleteSource(item.id).unwrap();
                  await refetch();
                }}
                className="cursor-pointer text-xs text-red-600 hover:underline disabled:opacity-50"
              >
                Удалить
              </button>
            </div>
          </li>
        ))}
        {data?.items.length === 0 && !uploading && (
          <li className="text-sm text-slate-400">
            Пока нет файлов. Загрузите первый регламент или шаблон — без этого сверка договора не
            сработает.
          </li>
        )}
      </ul>
    </div>
  );
}
