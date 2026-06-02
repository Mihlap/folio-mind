import { useEffect, useMemo, useState } from 'react';
import {
  useGetJobQuery,
  useGetVersionPreviewsQuery,
  useMergeVersionsMutation,
  useSplitPagesMutation,
} from '@folio-mind/store';
import type { DocumentVersionItem } from './DocumentVersionsPanel.js';

function parsePageNumbers(input: string, maxPage: number): number[] | string {
  const parts = input
    .split(/[,;\s]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return 'Укажите номера страниц';

  const pages: number[] = [];
  for (const part of parts) {
    const n = Number(part);
    if (!Number.isInteger(n) || n < 1) return `Некорректный номер: ${part}`;
    if (n > maxPage) return `Страница ${n} больше числа страниц (${maxPage})`;
    if (!pages.includes(n)) pages.push(n);
  }
  return pages.sort((a, b) => a - b);
}

function getMutationError(err: unknown): string {
  if (typeof err === 'object' && err && 'data' in err) {
    const data = (err as { data?: unknown }).data;
    if (typeof data === 'string') return data;
    if (typeof data === 'object' && data && 'error' in data) {
      return String((data as { error: string }).error);
    }
  }
  return 'Не удалось выполнить операцию';
}

type Props = {
  documentId: string;
  versions: DocumentVersionItem[];
  activeVersion: DocumentVersionItem | undefined;
  viewerPage: number;
  onSelectVersion: (versionId: string) => void;
};

export function DocumentPdfOperationsPanel({
  documentId,
  versions,
  activeVersion,
  viewerPage,
  onSelectVersion,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [pagesInput, setPagesInput] = useState('');
  const [mergeOrder, setMergeOrder] = useState<string[]>([]);
  const [operationJobId, setOperationJobId] = useState<string | null>(null);
  const [pollOperation, setPollOperation] = useState(false);
  const [targetVersionId, setTargetVersionId] = useState<string | null>(null);
  const [statusHint, setStatusHint] = useState<string | null>(null);
  const [statusHintVersionId, setStatusHintVersionId] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);

  const [splitPages, { isLoading: splitLoading }] = useSplitPagesMutation();
  const [mergeVersions, { isLoading: mergeLoading }] = useMergeVersionsMutation();

  const { data: operationJob } = useGetJobQuery(operationJobId!, {
    skip: !operationJobId,
    pollingInterval: pollOperation ? 2000 : 0,
  });

  const { data: activeVersionMeta } = useGetVersionPreviewsQuery(
    {
      documentId,
      versionId: activeVersion?.id ?? '',
      from: 1,
      to: 1,
    },
    {
      skip: !activeVersion?.id || activeVersion.status === 'pending_upload',
    },
  );

  const targetVersion = useMemo(
    () => (targetVersionId ? versions.find((v) => v.id === targetVersionId) : undefined),
    [targetVersionId, versions],
  );

  const readyVersions = useMemo(
    () => versions.filter((v) => v.status === 'ready'),
    [versions],
  );

  const activeReady = activeVersion?.status === 'ready';
  const effectivePageCount =
    (activeVersion?.pageCount && activeVersion.pageCount > 0
      ? activeVersion.pageCount
      : activeVersionMeta?.pageCount && activeVersionMeta.pageCount > 0
        ? activeVersionMeta.pageCount
        : 0) ?? 0;

  const optimizeRunning = Boolean(
    operationJobId &&
      pollOperation &&
      operationJob &&
      (operationJob.status === 'queued' || operationJob.status === 'processing'),
  );

  const operationPending = splitLoading || mergeLoading || optimizeRunning;

  const splitBlockedReason = (() => {
    if (!activeVersion) return 'Выберите версию в списке выше';
    if (activeVersion.status === 'processing') return 'Версия ещё обрабатывается';
    if (activeVersion.status === 'failed') return 'Версия с ошибкой — удалите или создайте заново';
    if (activeVersion.status === 'pending_upload') return 'Файл не загружен';
    if (!activeReady) return `Статус версии: ${activeVersion.status}`;
    if (operationPending) return 'Дождитесь завершения текущей операции…';
    if (effectivePageCount <= 0) return 'Число страниц неизвестно — обновите страницу';
    return null;
  })();

  useEffect(() => {
    if (!operationJobId || !operationJob) return;
    if (operationJob.status === 'completed') {
      setPollOperation(false);
      if (targetVersion) {
        setStatusHint(
          `Версия ${targetVersion.version} собрана — PDF в viewer, миниатюры подгружаются.`,
        );
        setStatusHintVersionId(targetVersion.id);
      }
    }
    if (operationJob.status === 'failed') {
      setPollOperation(false);
      setOperationJobId(null);
      setTargetVersionId(null);
      const payload = operationJob.payload;
      const msg =
        typeof payload === 'object' && payload && 'error' in payload
          ? String((payload as { error?: string }).error ?? 'Операция завершилась с ошибкой')
          : 'Операция завершилась с ошибкой';
      setOperationError(msg);
      setStatusHint(null);
      setStatusHintVersionId(null);
    }
  }, [operationJob, operationJobId, targetVersion]);

  useEffect(() => {
    if (!targetVersion) return;
    if (targetVersion.status === 'ready') {
      setStatusHint(`Версия ${targetVersion.version} готова`);
      setStatusHintVersionId(targetVersion.id);
      setOperationJobId(null);
      setTargetVersionId(null);
      setPollOperation(false);
      const timer = setTimeout(() => setStatusHint(null), 5000);
      return () => clearTimeout(timer);
    }
    if (targetVersion.status === 'failed') {
      setOperationError(`Версия ${targetVersion.version} не обработана — проверьте worker и S3`);
      setStatusHint(null);
      setStatusHintVersionId(null);
      setOperationJobId(null);
      setTargetVersionId(null);
      setPollOperation(false);
    }
  }, [targetVersion?.id, targetVersion?.status, targetVersion?.version]);

  useEffect(() => {
    if (!statusHintVersionId) return;
    const exists = versions.some((v) => v.id === statusHintVersionId);
    if (!exists) {
      setStatusHint(null);
      setStatusHintVersionId(null);
    }
  }, [statusHintVersionId, versions]);

  useEffect(() => {
    setPagesInput('');
    setOperationError(null);
    // При смене версии убираем «успешные» всплывашки, чтобы не путать пользователя.
    setStatusHint(null);
    setStatusHintVersionId(null);
  }, [activeVersion?.id]);

  function toggleMergeVersion(versionId: string, checked: boolean) {
    setMergeOrder((prev) => {
      if (!checked) return prev.filter((id) => id !== versionId);
      if (prev.includes(versionId)) return prev;
      return [...prev, versionId];
    });
  }

  function moveMergeVersion(versionId: string, direction: -1 | 1) {
    setMergeOrder((prev) => {
      const index = prev.indexOf(versionId);
      if (index < 0) return prev;
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(nextIndex, 0, item!);
      return next;
    });
  }

  function beginOperation(result: {
    operationJobId: string;
    versionId: string;
    version: number;
  }) {
    setOperationJobId(result.operationJobId);
    setTargetVersionId(result.versionId);
    setPollOperation(true);
    setOperationError(null);
    setStatusHint(`Создана версия ${result.version}. Worker собирает PDF…`);
    onSelectVersion(result.versionId);
  }

  async function handleSplit() {
    if (!activeVersion || !activeReady) return;
    setOperationError(null);
    setStatusHint(null);

    const parsed = parsePageNumbers(pagesInput, effectivePageCount);
    if (typeof parsed === 'string') {
      setOperationError(parsed);
      return;
    }

    try {
      const result = await splitPages({
        documentId,
        versionId: activeVersion.id,
        pages: parsed,
      }).unwrap();
      beginOperation(result);
    } catch (err) {
      setOperationError(getMutationError(err));
    }
  }

  async function handleMerge() {
    if (mergeOrder.length < 2) {
      setOperationError('Выберите минимум две готовые версии');
      return;
    }
    setOperationError(null);
    setStatusHint(null);

    try {
      const result = await mergeVersions({
        documentId,
        versionIds: mergeOrder,
      }).unwrap();
      beginOperation(result);
      setMergeOrder([]);
    } catch (err) {
      setOperationError(getMutationError(err));
    }
  }

  const progressLabel = (() => {
    if (operationError) return null;
    if (splitLoading || mergeLoading) return 'Запуск операции…';
    if (optimizeRunning) return 'Собираем PDF (merge/split)…';
    return statusHint;
  })();

  return (
    <section className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full cursor-pointer items-center justify-between px-4 py-3 text-left sm:px-5"
      >
        <span className="text-sm font-semibold text-slate-900">Операции с PDF</span>
        <span className="text-xs text-slate-500">{expanded ? 'Свернуть' : 'Развернуть'}</span>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="text-sm font-medium text-slate-800">Вырезать страницы</h3>
              <p className="mt-1 text-xs text-slate-500">
                Из текущей версии{' '}
                {activeVersion ? `v${activeVersion.version}` : '—'}
                {effectivePageCount > 0 ? ` · всего ${effectivePageCount} стр.` : ''}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  type="text"
                  value={pagesInput}
                  onChange={(e) => setPagesInput(e.target.value)}
                  placeholder="1, 3, 5"
                  disabled={!activeReady || operationPending}
                  className="min-w-[12rem] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-50"
                />
                <button
                  type="button"
                  disabled={!activeReady || operationPending || effectivePageCount <= 0}
                  onClick={() => {
                    const next = new Set(
                      pagesInput
                        .split(/[,;\s]+/)
                        .map((p) => Number(p.trim()))
                        .filter((n) => Number.isInteger(n) && n >= 1),
                    );
                    next.add(viewerPage);
                    setPagesInput([...next].sort((a, b) => a - b).join(', '));
                  }}
                  className="cursor-pointer rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  + стр. {viewerPage}
                </button>
              </div>
              <button
                type="button"
                disabled={
                  !activeReady || operationPending || effectivePageCount <= 0
                }
                onClick={() => void handleSplit()}
                className="mt-3 cursor-pointer rounded-lg bg-folio-600 px-4 py-2 text-sm font-medium text-white hover:bg-folio-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {splitLoading ? 'Запуск…' : 'Вырезать в новую версию'}
              </button>
              {splitBlockedReason && (
                <p className="mt-2 text-xs text-amber-700">{splitBlockedReason}</p>
              )}
            </div>

            <div>
              <h3 className="text-sm font-medium text-slate-800">Объединить версии</h3>
              <p className="mt-1 text-xs text-slate-500">
                Порядок в списке ниже — порядок страниц в итоговом PDF
              </p>
              <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto">
                {readyVersions.length < 2 ? (
                  <li className="text-xs text-slate-500">Нужно минимум две готовые версии</li>
                ) : (
                  readyVersions.map((v) => {
                    const selected = mergeOrder.includes(v.id);
                    const orderIndex = mergeOrder.indexOf(v.id);
                    return (
                      <li
                        key={v.id}
                        className={`flex flex-wrap items-center gap-2 rounded-lg border px-2 py-1.5 text-sm ${
                          selected ? 'border-folio-200 bg-folio-50/50' : 'border-slate-100'
                        }`}
                      >
                        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selected}
                            disabled={operationPending}
                            onChange={(e) => toggleMergeVersion(v.id, e.target.checked)}
                          />
                          <span>
                            Версия {v.version}
                            {v.pageCount ? ` · ${v.pageCount} стр.` : ''}
                          </span>
                        </label>
                        {selected && (
                          <span className="flex items-center gap-1">
                            <span className="text-xs text-folio-700">#{orderIndex + 1}</span>
                            <button
                              type="button"
                              disabled={orderIndex === 0 || operationPending}
                              onClick={() => moveMergeVersion(v.id, -1)}
                              className="cursor-pointer rounded px-1 text-xs text-slate-600 hover:bg-white disabled:opacity-40"
                              title="Выше"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              disabled={orderIndex === mergeOrder.length - 1 || operationPending}
                              onClick={() => moveMergeVersion(v.id, 1)}
                              className="cursor-pointer rounded px-1 text-xs text-slate-600 hover:bg-white disabled:opacity-40"
                              title="Ниже"
                            >
                              ↓
                            </button>
                          </span>
                        )}
                      </li>
                    );
                  })
                )}
              </ul>
              <button
                type="button"
                disabled={mergeOrder.length < 2 || operationPending}
                onClick={() => void handleMerge()}
                className="mt-3 cursor-pointer rounded-lg bg-folio-600 px-4 py-2 text-sm font-medium text-white hover:bg-folio-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {mergeLoading ? 'Запуск…' : 'Объединить в новую версию'}
              </button>
            </div>
          </div>

          {progressLabel && (
            <p className="mt-4 text-sm text-folio-700">{progressLabel}</p>
          )}
          {operationError && <p className="mt-2 text-sm text-red-600">{operationError}</p>}
        </div>
      )}
    </section>
  );
}
