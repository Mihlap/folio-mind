import { useEffect, useMemo, useState } from 'react';
import {
  OPTIMIZE_PRESET_INFO,
  OPTIMIZE_PRESETS,
  useGetJobQuery,
  useGetVersionPreviewsQuery,
  useMergeVersionsMutation,
  useOptimizePdfMutation,
  useSplitPagesMutation,
  type OptimizePreset,
} from '@folio-mind/store';
import {
  estimateOptimizeSize,
  formatFileSize,
  formatOptimizeSizeRange,
} from '@folio-mind/store';
import type { DocumentVersionItem } from './DocumentVersionsPanel.js';
import {
  FeatureHelpActionButton,
  FeatureHelpButton,
  reportActionBtnPrimary,
  reportActionsColumnClass,
} from '../ui/FeatureHelp.js';
import {
  TOOL_SECTION_IDS,
  ToolAccordionSection,
  type ToolSectionId,
} from '../ui/ToolAccordionSection.js';
import { DocumentVersionDiffPanel } from './DocumentVersionDiffPanel.js';
import { DocumentAnnotationsControllerProvider, DocumentAnnotationsPanel } from './DocumentAnnotationsPanel.js';
import { DocumentAiSuggestionsPanel } from './DocumentAiSuggestionsPanel.js';
import { DocumentLayoutPanel } from './DocumentLayoutPanel.js';
import { DocumentSharePanel } from './DocumentSharePanel.js';
import { DocumentGuestCommentsPanel } from './DocumentGuestCommentsPanel.js';
import type { EditTextInjection } from './useDocumentAnnotationsPanel.js';
import type { LayoutEditorState } from '../../hooks/useLayoutEditor.js';
import type { DocumentReviewStatus } from '@folio-mind/store';
import { useDocumentAnnotationsPanel } from './useDocumentAnnotationsPanel.js';
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
    const data = (
      err as {
        data?: unknown;
      }
    ).data;
    if (typeof data === 'string') return data;
    if (typeof data === 'object' && data && 'error' in data) {
      return String(
        (
          data as {
            error: string;
          }
        ).error,
      );
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
  onGoToPage: (page: number, annotationId?: string) => void;
  focusedAnnotationId?: string | null;
  focusedGuestCommentId?: string | null;
  onOpenAcceptedEdit: (page: number, annotationId: string) => void;
  onOpenAllAcceptedEdits: () => void;
  editTextInjection?: EditTextInjection | null;
  versionReady: boolean;
  embedded?: boolean;
  focusSection?: ToolSectionId | null;
  onFocusSectionHandled?: () => void;
  layout?: LayoutEditorState;
  layoutAddNotice?: string | null;
  layoutPageCount?: number;
  onAddLayoutImages?: (
    files: File[],
    options?: { distributeAcrossPages?: boolean; startPage?: number },
  ) => Promise<void>;
  reviewStatus?: DocumentReviewStatus;
  reviewStatusChangedAt?: string | null;
};
export function DocumentPdfOperationsPanel({
  documentId,
  versions,
  activeVersion,
  viewerPage,
  onSelectVersion,
  onGoToPage,
  focusedAnnotationId = null,
  focusedGuestCommentId = null,
  onOpenAcceptedEdit,
  onOpenAllAcceptedEdits,
  editTextInjection = null,
  versionReady,
  embedded = false,
  focusSection = null,
  onFocusSectionHandled,
  layout,
  layoutAddNotice = null,
  layoutPageCount = 0,
  onAddLayoutImages,
  reviewStatus = 'draft',
  reviewStatusChangedAt = null,
}: Props) {
  const [expanded, setExpanded] = useState(embedded);
  const [openSections, setOpenSections] = useState<Set<ToolSectionId>>(() => new Set());
  const [pagesInput, setPagesInput] = useState('');
  const [mergeOrder, setMergeOrder] = useState<string[]>([]);
  const [optimizePreset, setOptimizePreset] = useState<OptimizePreset>('archive');
  const [operationJobId, setOperationJobId] = useState<string | null>(null);
  const [pollOperation, setPollOperation] = useState(false);
  const [targetVersionId, setTargetVersionId] = useState<string | null>(null);
  const [statusHint, setStatusHint] = useState<string | null>(null);
  const [statusHintVersionId, setStatusHintVersionId] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [splitPages, { isLoading: splitLoading }] = useSplitPagesMutation();
  const [mergeVersions, { isLoading: mergeLoading }] = useMergeVersionsMutation();
  const [optimizePdf, { isLoading: optimizeLoading }] = useOptimizePdfMutation();
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
  const readyVersions = useMemo(() => versions.filter((v) => v.status === 'ready'), [versions]);
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
  const operationPending = splitLoading || mergeLoading || optimizeLoading || optimizeRunning;
  const splitBlockedReason = (() => {
    if (!activeVersion) return 'Выберите версию в списке слева';
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
        const payload = operationJob.payload;
        const optimizeMessage =
          typeof payload === 'object' && payload && 'message' in payload
            ? String((payload as { message?: string }).message ?? '')
            : '';
        const savedPct =
          typeof payload === 'object' && payload && 'savedPercent' in payload
            ? Number((payload as { savedPercent?: number }).savedPercent)
            : NaN;
        const outputBytes =
          typeof payload === 'object' && payload && 'outputBytes' in payload
            ? Number((payload as { outputBytes?: number }).outputBytes)
            : NaN;
        const sizeNote =
          Number.isFinite(outputBytes) && outputBytes > 0
            ? ` · ${formatFileSize(outputBytes)}`
            : '';
        const savedNote =
          Number.isFinite(savedPct) && savedPct > 0 ? ` (−${savedPct}%)` : '';
        const detail = optimizeMessage || `Версия ${targetVersion.version} собрана`;
        setStatusHint(`${detail}${sizeNote}${savedNote} — PDF в viewer, миниатюры подгружаются.`);
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
          ? String(
              (
                payload as {
                  error?: string;
                }
              ).error ?? 'Операция завершилась с ошибкой',
            )
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
  function beginOperation(result: { operationJobId: string; versionId: string; version: number }) {
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
  async function handleOptimize() {
    if (!activeVersion || !activeReady) return;
    setOperationError(null);
    setStatusHint(null);
    try {
      const result = await optimizePdf({
        documentId,
        versionId: activeVersion.id,
        preset: optimizePreset,
      }).unwrap();
      beginOperation(result);
    } catch (err) {
      setOperationError(getMutationError(err));
    }
  }
  const progressLabel = (() => {
    if (operationError) return null;
    if (splitLoading || mergeLoading || optimizeLoading) return 'Запуск операции…';
    if (optimizeRunning) return 'Сжимаем PDF…';
    return statusHint;
  })();
  const versionSubtitle =
    activeVersion && effectivePageCount > 0
      ? `Из v${activeVersion.version} · ${effectivePageCount} стр.`
      : activeVersion
        ? `Из v${activeVersion.version}`
        : 'Выберите версию слева';
  const mergeSubtitle =
    readyVersions.length < 2
      ? 'Нужно минимум две готовые версии'
      : `${readyVersions.length} готовых версий`;
  const sourceBytes = activeVersion?.size ? Number(activeVersion.size) : 0;
  const optimizeEstimate = useMemo(() => {
    if (!activeReady || sourceBytes <= 0) return null;
    return estimateOptimizeSize(sourceBytes, effectivePageCount, optimizePreset);
  }, [activeReady, effectivePageCount, optimizePreset, sourceBytes]);
  const allSectionsOpen = openSections.size === TOOL_SECTION_IDS.length;
  const noSectionsOpen = openSections.size === 0;
  function isSectionOpen(id: ToolSectionId) {
    return openSections.has(id);
  }
  function toggleSection(id: ToolSectionId) {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function expandAllSections() {
    setOpenSections(new Set(TOOL_SECTION_IDS));
  }
  function collapseAllSections() {
    setOpenSections(new Set());
  }
  useEffect(() => {
    if (!editTextInjection) return;
    setOpenSections((prev) => {
      if (prev.has('edits')) return prev;
      const next = new Set(prev);
      next.add('edits');
      return next;
    });
  }, [editTextInjection?.key]);
  useEffect(() => {
    if (!focusSection) return;
    setExpanded(true);
    setOpenSections((prev) => {
      if (prev.has(focusSection)) return prev;
      const next = new Set(prev);
      next.add(focusSection);
      return next;
    });
    onFocusSectionHandled?.();
  }, [focusSection, onFocusSectionHandled]);
  const annotationsSharedProps = {
    documentId,
    versionId: activeVersion?.id ?? '',
    viewerPage,
    versionReady,
    focusedAnnotationId,
    onOpenAcceptedEdit,
    onOpenAllAcceptedEdits,
    editTextInjection,
    onGoToPage,
    onSelectVersion,
  };
  const annotationsController = useDocumentAnnotationsPanel(annotationsSharedProps);
  const body = (
    <div className={embedded ? 'space-y-2 p-3' : 'border-t border-slate-100 px-4 pb-4 pt-3 sm:px-5 sm:pb-5'}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
        <p className="text-[11px] text-slate-500">Откройте нужный раздел или все сразу</p>
        <div className="flex shrink-0 gap-1.5">
          <button
            type="button"
            disabled={allSectionsOpen}
            onClick={expandAllSections}
            className="cursor-pointer rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Развернуть все
          </button>
          <button
            type="button"
            disabled={noSectionsOpen}
            onClick={collapseAllSections}
            className="cursor-pointer rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Свернуть все
          </button>
        </div>
      </div>

      {progressLabel && <p className="text-sm text-folio-700">{progressLabel}</p>}
      {operationError && <p className="text-sm text-red-600">{operationError}</p>}

      <div className="space-y-2">
        <ToolAccordionSection
          title="Сжать PDF"
          subtitle="Меньший файл для почты и чатов"
          isOpen={isSectionOpen('optimize')}
          onToggle={() => toggleSection('optimize')}
          helpTitle="Пресеты сжатия"
          helpContent={
            <>
              <p>
                Создаётся новая версия с меньшим размером. Текст в договорах обычно не ужимается —
                заметный эффект у файлов с фотографиями и иллюстрациями.
              </p>
              <p>До 200 страниц. Исходная версия не изменяется.</p>
            </>
          }
        >
          <div className="space-y-2">
            {OPTIMIZE_PRESETS.map((presetId) => {
              const info = OPTIMIZE_PRESET_INFO[presetId];
              return (
                <label
                  key={presetId}
                  className={`flex cursor-pointer gap-2 rounded-lg border px-3 py-2 text-sm ${
                    optimizePreset === presetId
                      ? 'border-folio-300 bg-folio-50/60'
                      : 'border-slate-100 hover:border-slate-200'
                  }`}
                >
                  <input
                    type="radio"
                    name="optimize-preset"
                    value={presetId}
                    checked={optimizePreset === presetId}
                    disabled={!activeReady || operationPending}
                    onChange={() => setOptimizePreset(presetId)}
                    className="mt-1"
                  />
                  <span>
                    <span className="font-medium text-slate-900">{info.label}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">{info.description}</span>
                  </span>
                </label>
              );
            })}
          </div>
          {sourceBytes > 0 && (
            <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 text-xs text-slate-600">
              <p>
                Текущий файл:{' '}
                <span className="font-medium text-slate-800">{formatFileSize(sourceBytes)}</span>
                {effectivePageCount > 0 ? ` · ${effectivePageCount} стр.` : ''}
              </p>
              {optimizeEstimate && (
                <p className="mt-1">
                  Ожидаемый размер:{' '}
                  <span className="font-medium text-slate-800">
                    {formatOptimizeSizeRange(optimizeEstimate)}
                  </span>
                  {optimizeEstimate.likelyTextOnly && optimizePreset !== 'none' && (
                    <span className="mt-0.5 block text-slate-500">
                      Похоже на текстовый PDF — заметного сжатия может не быть.
                    </span>
                  )}
                </p>
              )}
            </div>
          )}
          <div className={`mt-3 ${reportActionsColumnClass}`}>
            <FeatureHelpActionButton
              helpTitle="Сжать в новую версию"
              disabled={!activeReady || operationPending || effectivePageCount <= 0}
              onClick={() => void handleOptimize()}
              buttonClassName={reportActionBtnPrimary}
              helpContent={
                <>
                  <p>Worker соберёт оптимизированный PDF и добавит его как новую версию в списке слева.</p>
                  <p>Нужна готовая версия с известным числом страниц (не более 200).</p>
                </>
              }
            >
              {optimizeLoading ? 'Запуск…' : 'Сжать в новую версию'}
            </FeatureHelpActionButton>
          </div>
        </ToolAccordionSection>

        <ToolAccordionSection
          title="Вырезать страницы"
          subtitle={versionSubtitle}
          isOpen={isSectionOpen('split')}
          onToggle={() => toggleSection('split')}
          helpTitle="Вырезать страницы"
          helpContent={
            <>
              <p>
                Укажите номера страниц открытой версии — через запятую или кнопкой «+ стр.» добавьте
                текущую страницу из просмотрщика.
              </p>
              <p>
                Будет создана новая версия PDF только с выбранными страницами. Исходная версия не
                изменяется.
              </p>
            </>
          }
        >
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={pagesInput}
              onChange={(e) => setPagesInput(e.target.value)}
              placeholder="1, 2 или выберите страницу"
              disabled={!activeReady || operationPending}
              className="min-w-[12rem] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-50"
            />
            <div className="inline-flex items-center gap-0.5">
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
                className="inline-flex h-8 cursor-pointer items-center rounded-md border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                + стр. {viewerPage}
              </button>
              <FeatureHelpButton title={`Страница ${viewerPage}`}>
                <p>
                  Добавляет в поле номеров страницу, которую вы сейчас смотрите в PDF. Удобно
                  выбирать страницы по одной, не вводя номер вручную.
                </p>
              </FeatureHelpButton>
            </div>
          </div>
          <div className={`mt-3 ${reportActionsColumnClass}`}>
            <FeatureHelpActionButton
              helpTitle="Вырезать в новую версию"
              disabled={!activeReady || operationPending || effectivePageCount <= 0}
              onClick={() => void handleSplit()}
              buttonClassName={reportActionBtnPrimary}
              helpContent={
                <>
                  <p>
                    Запускает сборку новой версии с выбранными страницами. После готовности она
                    появится в списке версий слева и откроется в просмотрщике.
                  </p>
                  <p>Нужна готовая версия с известным числом страниц.</p>
                </>
              }
            >
              {splitLoading ? 'Запуск…' : 'Вырезать в новую версию'}
            </FeatureHelpActionButton>
          </div>
          {splitBlockedReason && (
            <p className="mt-2 text-xs text-amber-700">{splitBlockedReason}</p>
          )}
        </ToolAccordionSection>

        <ToolAccordionSection
          title="Объединить версии"
          subtitle={mergeSubtitle}
          isOpen={isSectionOpen('merge')}
          onToggle={() => toggleSection('merge')}
          helpTitle="Объединить версии"
          helpContent={
            <>
              <p>
                Отметьте две и более готовые версии. Стрелками ↑↓ задайте порядок: сначала все
                страницы первой версии, затем второй и т.д.
              </p>
              <p>
                По кнопке «Объединить в новую версию» worker соберёт один PDF — новая версия появится
                в списке слева.
              </p>
            </>
          }
        >
          <p className="mb-2 text-[11px] text-slate-500">
            Порядок в списке — порядок страниц в итоговом PDF
          </p>
          <ul className="space-y-2">
            {readyVersions.length < 2 ? (
              <li className="text-xs text-slate-500">Нужно минимум две готовые версии</li>
            ) : (
              readyVersions.map((v) => {
                const selected = mergeOrder.includes(v.id);
                const orderIndex = mergeOrder.indexOf(v.id);
                return (
                  <li
                    key={v.id}
                    className={`flex flex-wrap items-center gap-2 rounded-lg border px-2 py-1.5 text-sm ${selected ? 'border-folio-200 bg-folio-50/50' : 'border-slate-100'}`}
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
          <div className={`mt-3 ${reportActionsColumnClass}`}>
            <FeatureHelpActionButton
              helpTitle="Объединить в новую версию"
              disabled={mergeOrder.length < 2 || operationPending}
              onClick={() => void handleMerge()}
              buttonClassName={reportActionBtnPrimary}
              helpContent={
                <>
                  <p>
                    Создаёт новую версию документа из выбранных готовых PDF в указанном порядке.
                  </p>
                  <p>Минимум две версии со статусом «готов».</p>
                </>
              }
            >
              {mergeLoading ? 'Запуск…' : 'Объединить в новую версию'}
            </FeatureHelpActionButton>
          </div>
        </ToolAccordionSection>

        {layout && (
          <ToolAccordionSection
            title="Макет"
            subtitle="Изображения на листе, линейки и сетка"
            isOpen={isSectionOpen('layout')}
            onToggle={() => toggleSection('layout')}
            helpTitle="Режим макета"
            helpContent={
              <>
                <p>Для буклетов и альбомов: разместите рендер или фото на странице PDF.</p>
                <p>Линейки в миллиметрах, сетка и привязка помогают выровнять картинку на листе.</p>
              </>
            }
          >
            <DocumentLayoutPanel
              layout={layout}
              viewerPage={viewerPage}
              versionReady={versionReady}
              documentId={documentId}
              versionId={activeVersion?.id ?? ''}
              pageCount={layoutPageCount}
              onSelectVersion={onSelectVersion}
              onGoToPage={onGoToPage}
              addNotice={layoutAddNotice}
              onAddImages={onAddLayoutImages}
            />
          </ToolAccordionSection>
        )}

        <ToolAccordionSection
          title="Ссылка для заказчика"
          subtitle="Гостевой просмотр превью без скачивания"
          isOpen={isSectionOpen('share')}
          onToggle={() => toggleSection('share')}
          helpTitle="Гостевой просмотр"
          helpContent={
            <>
              <p>
                Создайте ссылку с ограниченным сроком действия. Заказчик видит превью страниц в
                браузере — без доступа к исходному PDF.
              </p>
              <p>Ссылку можно отозвать в любой момент.</p>
            </>
          }
        >
          <DocumentSharePanel
            documentId={documentId}
            activeVersion={activeVersion}
            versionReady={versionReady}
            reviewStatus={reviewStatus}
            reviewStatusChangedAt={reviewStatusChangedAt}
          />
          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="mb-2 text-xs font-medium text-slate-700">Замечания заказчика</p>
            <DocumentGuestCommentsPanel
              documentId={documentId}
              versionId={activeVersion?.id ?? ''}
              versionReady={versionReady}
              focusedCommentId={focusedGuestCommentId}
              onGoToComment={(page, commentId) => {
                if (!isSectionOpen('share')) toggleSection('share');
                onGoToPage(page, commentId);
              }}
            />
          </div>
        </ToolAccordionSection>

        <DocumentAnnotationsControllerProvider value={annotationsController}>
          <ToolAccordionSection
            title="Аннотации"
            subtitle="Комментарии к страницам PDF"
            isOpen={isSectionOpen('annotations')}
            onToggle={() => toggleSection('annotations')}
            helpTitle="Аннотации"
            helpContent={
              <p>
                <strong>Заметка</strong> — комментарий к странице без изменения текста договора.
              </p>
            }
          >
            <DocumentAnnotationsPanel variant="notes" hideSectionHeader />
          </ToolAccordionSection>

          <ToolAccordionSection
            title="Правки в PDF"
            subtitle="Ручные и ИИ-правки, сборка новой версии"
            isOpen={isSectionOpen('edits')}
            onToggle={() => toggleSection('edits')}
            helpTitle="Правки в PDF"
            helpContent={
              <>
                <p>
                  Зафиксируйте «было / стало» вручную или запросите предложения ИИ в этом же
                  разделе.
                </p>
                <p>Затем соберите PDF с реестром правок, примените изменения в текст или выгрузите DOCX.</p>
              </>
            }
          >
            <DocumentAnnotationsPanel variant="edits" hideSectionHeader />
            <DocumentAiSuggestionsPanel
              documentId={documentId}
              versionId={activeVersion?.id ?? ''}
              versionReady={versionReady}
              onGoToPage={onGoToPage}
              onSelectVersion={onSelectVersion}
            />
          </ToolAccordionSection>
        </DocumentAnnotationsControllerProvider>

        <ToolAccordionSection
          title="Сравнение версий"
          subtitle="Текст и правки между версиями"
          isOpen={isSectionOpen('diff')}
          onToggle={() => toggleSection('diff')}
          helpTitle="Сравнение версий"
          helpContent={
            <>
              <p>
                Сравнивает текст страниц и принятые правки между выбранной базовой версией и
                текущей.
              </p>
            </>
          }
        >
          <DocumentVersionDiffPanel
            documentId={documentId}
            versions={versions}
            activeVersion={activeVersion}
            onGoToPage={onGoToPage}
            hideSectionHeader
          />
        </ToolAccordionSection>
      </div>
    </div>
  );
  if (embedded) {
    return <div className="text-sm">{body}</div>;
  }
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
      {expanded && body}
    </section>
  );
}
