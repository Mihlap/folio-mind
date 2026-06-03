import { useEffect, useMemo, useState } from 'react';
import { useLazyCompareVersionsQuery } from '@folio-mind/store';
import type { DocumentVersionItem } from './DocumentVersionsPanel.js';

type DiffLine = { type: 'equal' | 'insert' | 'delete'; text: string };

type PageDiff = {
  page: number;
  status: 'unchanged' | 'modified' | 'added' | 'removed';
  baseText?: string;
  compareText?: string;
  lines?: DiffLine[];
};

function getQueryError(err: unknown): string {
  if (typeof err === 'object' && err && 'data' in err) {
    const data = (err as { data?: unknown }).data;
    if (typeof data === 'string') return data;
    if (typeof data === 'object' && data && 'error' in data) {
      return String((data as { error: string }).error);
    }
  }
  return 'Не удалось сравнить версии';
}

const STATUS_LABEL: Record<string, string> = {
  unchanged: 'без изменений',
  modified: 'изменена',
  added: 'добавлена',
  removed: 'удалена',
};

type Props = {
  documentId: string;
  versions: DocumentVersionItem[];
  activeVersion: DocumentVersionItem | undefined;
  onGoToPage: (page: number) => void;
};

export function DocumentVersionDiffPanel({
  documentId,
  versions,
  activeVersion,
  onGoToPage,
}: Props) {
  const readyVersions = useMemo(
    () => versions.filter((v) => v.status === 'ready'),
    [versions],
  );

  const defaultBaseId = useMemo(() => {
    if (!activeVersion) return '';
    const index = readyVersions.findIndex((v) => v.id === activeVersion.id);
    if (index > 0) return readyVersions[index - 1]!.id;
    if (readyVersions.length >= 2 && readyVersions[0]?.id !== activeVersion.id) {
      return readyVersions[0]!.id;
    }
    return readyVersions.find((v) => v.id !== activeVersion.id)?.id ?? '';
  }, [activeVersion, readyVersions]);

  const [baseVersionId, setBaseVersionId] = useState(defaultBaseId);
  const [expandedPage, setExpandedPage] = useState<number | null>(null);
  const [compare, { data, isFetching, error, reset }] = useLazyCompareVersionsQuery();

  useEffect(() => {
    setBaseVersionId(defaultBaseId);
    reset();
    setExpandedPage(null);
  }, [activeVersion?.id, defaultBaseId, reset]);

  const compareVersionId = activeVersion?.id ?? '';
  const canCompare =
    Boolean(baseVersionId && compareVersionId && baseVersionId !== compareVersionId) &&
    activeVersion?.status === 'ready';

  const changedPages = useMemo(
    () => (data?.pages.filter((p: PageDiff) => p.status !== 'unchanged') ?? []) as PageDiff[],
    [data?.pages],
  );

  async function handleCompare() {
    if (!canCompare) return;
    setExpandedPage(null);
    await compare({
      documentId,
      baseVersionId,
      compareVersionId,
    });
  }

  if (readyVersions.length < 2) {
    return (
      <p className="text-xs text-slate-500">
        Для сравнения нужно минимум две готовые версии документа.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-medium text-slate-800">Сравнение версий</h3>
        <p className="mt-1 text-xs text-slate-500">
          Текстовый diff по извлечённому слою PDF (база → текущая версия)
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[8rem] flex-1 text-xs text-slate-600">
          Базовая версия
          <select
            value={baseVersionId}
            onChange={(e) => {
              setBaseVersionId(e.target.value);
              reset();
              setExpandedPage(null);
            }}
            className="mt-1 w-full cursor-pointer rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
          >
            <option value="">—</option>
            {readyVersions
              .filter((v) => v.id !== compareVersionId)
              .map((v) => (
                <option key={v.id} value={v.id}>
                  v{v.version}
                  {v.pageCount ? ` · ${v.pageCount} стр.` : ''}
                </option>
              ))}
          </select>
        </label>
        <div className="text-xs text-slate-500">
          → v{activeVersion?.version ?? '—'}
        </div>
        <button
          type="button"
          disabled={!canCompare || isFetching}
          onClick={() => void handleCompare()}
          className="cursor-pointer rounded-lg bg-folio-600 px-3 py-2 text-xs font-medium text-white hover:bg-folio-700 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
        >
          {isFetching ? 'Сравнение…' : 'Сравнить'}
        </button>
      </div>

      {error && <p className="text-xs text-red-600">{getQueryError(error)}</p>}

      {data && (
        <>
          <p className="text-xs text-slate-600">
            v{data.baseVersion} → v{data.compareVersion}:{' '}
            {data.summary.modifiedPages > 0 && (
              <span>{data.summary.modifiedPages} изменённых</span>
            )}
            {data.summary.addedPages > 0 && (
              <span>
                {data.summary.modifiedPages > 0 ? ', ' : ''}
                {data.summary.addedPages} новых
              </span>
            )}
            {data.summary.removedPages > 0 && (
              <span>
                {data.summary.modifiedPages > 0 || data.summary.addedPages > 0 ? ', ' : ''}
                {data.summary.removedPages} удалённых
              </span>
            )}
            {changedPages.length === 0 && ' различий не найдено'}
          </p>

          {changedPages.length > 0 && (
            <ul className="space-y-2">
              {changedPages.map((pageDiff: PageDiff) => {
                const expanded = expandedPage === pageDiff.page;
                return (
                  <li
                    key={pageDiff.page}
                    className="rounded-lg border border-slate-200 bg-slate-50/80"
                  >
                    <div className="flex flex-wrap items-center gap-2 px-2 py-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedPage(expanded ? null : pageDiff.page)
                        }
                        className="cursor-pointer text-left text-xs font-medium text-slate-800 hover:text-folio-700"
                      >
                        Стр. {pageDiff.page} · {STATUS_LABEL[pageDiff.status] ?? pageDiff.status}
                      </button>
                      <button
                        type="button"
                        onClick={() => onGoToPage(pageDiff.page)}
                        className="ml-auto cursor-pointer rounded px-1.5 py-0.5 text-[11px] text-folio-700 hover:bg-folio-50"
                      >
                        Открыть в viewer
                      </button>
                    </div>

                    {expanded && pageDiff.status === 'modified' && pageDiff.lines && (
                      <div className="grid gap-2 border-t border-slate-200 p-2 sm:grid-cols-2">
                        <div>
                          <p className="mb-1 text-[10px] font-medium uppercase text-slate-400">
                            v{data.baseVersion}
                          </p>
                          <div className="rounded bg-white p-2 font-mono text-[11px] leading-relaxed">
                            {pageDiff.lines.map((line: DiffLine, i: number) =>
                              line.type === 'insert' ? null : (
                                <div
                                  key={`b-${i}`}
                                  className={
                                    line.type === 'delete'
                                      ? 'bg-red-50 text-red-800 line-through'
                                      : 'text-slate-700'
                                  }
                                >
                                  {line.text || '\u00a0'}
                                </div>
                              ),
                            )}
                          </div>
                        </div>
                        <div>
                          <p className="mb-1 text-[10px] font-medium uppercase text-slate-400">
                            v{data.compareVersion}
                          </p>
                          <div className="rounded bg-white p-2 font-mono text-[11px] leading-relaxed">
                            {pageDiff.lines.map((line: DiffLine, i: number) =>
                              line.type === 'delete' ? null : (
                                <div
                                  key={`c-${i}`}
                                  className={
                                    line.type === 'insert'
                                      ? 'bg-emerald-50 text-emerald-900'
                                      : 'text-slate-700'
                                  }
                                >
                                  {line.text || '\u00a0'}
                                </div>
                              ),
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {expanded && pageDiff.status === 'added' && pageDiff.compareText && (
                      <div className="border-t border-slate-200 p-2">
                        <p className="text-[11px] text-emerald-900">{pageDiff.compareText}</p>
                      </div>
                    )}

                    {expanded && pageDiff.status === 'removed' && pageDiff.baseText && (
                      <div className="border-t border-slate-200 p-2">
                        <p className="text-[11px] text-red-800 line-through">{pageDiff.baseText}</p>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
