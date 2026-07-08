import { useEffect, useMemo, useState } from 'react';
import {
  useGetVersionPreviewsQuery,
  useRearrangePagesMutation,
  HINT_PAGE_ORDER_SAVE_REPLACE_CURRENT,
} from '@folio-mind/store';
import { DocumentPageThumbnail } from './DocumentPageThumbnail.js';
import { FeatureHelpActionButton } from '../ui/FeatureHelp.js';
import { reportActionBtnPrimary, reportActionsColumnClass } from '../ui/FeatureHelp.styles.js';
import {
  OperationSaveModeSelect,
  type OperationSaveMode,
} from './OperationSaveModeSelect.js';

type OperationResult = {
  operationJobId: string;
  versionId: string;
  version: number;
  saveMode?: OperationSaveMode;
};

type Props = {
  documentId: string;
  versionId: string | undefined;
  versionNumber?: number;
  isLatestVersion?: boolean;
  versionsStamp: string;
  pageCount: number;
  versionReady: boolean;
  operationPending: boolean;
  onOperationStarted: (result: OperationResult) => void;
  onError: (message: string) => void;
};

const BLANK_PAGE = 0;

function buildDefaultOrder(pageCount: number): number[] {
  return Array.from({ length: pageCount }, (_, index) => index + 1);
}

function pageSlotLabel(sourcePage: number): string {
  return sourcePage === BLANK_PAGE ? 'Чистый лист' : `Стр. ${sourcePage}`;
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

export function DocumentPageOrderPanel({
  documentId,
  versionId,
  versionNumber,
  isLatestVersion = false,
  versionsStamp,
  pageCount,
  versionReady,
  operationPending,
  onOperationStarted,
  onError,
}: Props) {
  const [pageOrder, setPageOrder] = useState<number[]>([]);
  const [saveMode, setSaveMode] = useState<OperationSaveMode>('new_version');
  const [rearrangePages, { isLoading: rearrangeLoading }] = useRearrangePagesMutation();

  const previewTo = Math.min(pageCount, 40);
  const { data: previews } = useGetVersionPreviewsQuery(
    {
      documentId,
      versionId: versionId ?? '',
      from: 1,
      to: previewTo,
    },
    { skip: !versionId || !versionReady || pageCount <= 0 },
  );

  const thumbByPage = useMemo(() => {
    const map = new Map<number, string>();
    for (const item of previews?.pages ?? []) {
      map.set(item.page, item.url);
    }
    return map;
  }, [previews?.pages]);

  useEffect(() => {
    setPageOrder(pageCount > 0 ? buildDefaultOrder(pageCount) : []);
  }, [versionId, pageCount, versionsStamp]);

  const pending = operationPending || rearrangeLoading;
  const blockedReason = (() => {
    if (!versionId) return 'Выберите версию в списке слева';
    if (!versionReady) return 'Нужна готовая версия документа';
    if (pageCount <= 0) return 'Число страниц неизвестно — обновите страницу';
    if (operationPending) return 'Дождитесь завершения текущей операции…';
    return null;
  })();

  function moveSlot(index: number, direction: -1 | 1) {
    setPageOrder((prev) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(nextIndex, 0, item!);
      return next;
    });
  }

  function duplicateSlot(index: number) {
    setPageOrder((prev) => {
      if (prev.length >= 500) return prev;
      const next = [...prev];
      next.splice(index + 1, 0, prev[index]!);
      return next;
    });
  }

  function removeSlot(index: number) {
    setPageOrder((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  function resetOrder() {
    setPageOrder(buildDefaultOrder(pageCount));
  }

  function addBlankPage() {
    setPageOrder((prev) => (prev.length >= 500 ? prev : [...prev, BLANK_PAGE]));
  }

  async function handleApply() {
    if (!versionId || !versionReady || pageOrder.length === 0) return;
    try {
      const result = await rearrangePages({
        documentId,
        versionId,
        pages: pageOrder,
        saveMode,
      }).unwrap();
      onOperationStarted({ ...result, saveMode });
      resetOrder();
    } catch (err) {
      onError(getMutationError(err));
    }
  }

  const orderChanged = useMemo(() => {
    if (pageCount <= 0 || pageOrder.length !== pageCount) {
      return pageOrder.length > 0;
    }
    return pageOrder.some((page, index) => page !== index + 1);
  }, [pageCount, pageOrder]);

  return (
    <div className="space-y-3">
      <p className="text-[11px] leading-snug text-slate-500">
        Измените порядок, продублируйте лист или добавьте чистый лист кнопкой ниже. Исходная версия
        не меняется — будет создана новая.
      </p>

      {pageOrder.length > 0 ? (
        <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
          {pageOrder.map((sourcePage, index) => (
            <li
              key={`${index}-${sourcePage}`}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-2 py-1.5"
            >
              <span className="w-5 shrink-0 text-center text-[11px] font-medium text-slate-400">
                {index + 1}
              </span>
              <div className="h-12 w-9 shrink-0 overflow-hidden rounded border border-slate-200 bg-white">
                {sourcePage === BLANK_PAGE ? (
                  <div className="flex h-full items-center justify-center bg-white text-[9px] font-medium text-slate-400">
                    пусто
                  </div>
                ) : thumbByPage.get(sourcePage) ? (
                  <DocumentPageThumbnail
                    src={thumbByPage.get(sourcePage)!}
                    alt={`Стр. ${sourcePage}`}
                    layout="vertical"
                    eager
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-[10px] text-slate-400">
                    {sourcePage}
                  </div>
                )}
              </div>
              <span className="min-w-0 flex-1 text-xs text-slate-700">{pageSlotLabel(sourcePage)}</span>
              <span className="flex shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  disabled={index === 0 || pending}
                  onClick={() => moveSlot(index, -1)}
                  className="cursor-pointer rounded px-1 text-xs text-slate-600 hover:bg-white disabled:opacity-40"
                  title="Выше"
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={index === pageOrder.length - 1 || pending}
                  onClick={() => moveSlot(index, 1)}
                  className="cursor-pointer rounded px-1 text-xs text-slate-600 hover:bg-white disabled:opacity-40"
                  title="Ниже"
                >
                  ↓
                </button>
                <button
                  type="button"
                  disabled={pending || pageOrder.length >= 500}
                  onClick={() => duplicateSlot(index)}
                  className="cursor-pointer rounded px-1.5 text-xs text-folio-700 hover:bg-white disabled:opacity-40"
                  title="Дублировать"
                >
                  +1
                </button>
                <button
                  type="button"
                  disabled={pending || pageOrder.length <= 1}
                  onClick={() => removeSlot(index)}
                  className="cursor-pointer rounded px-2 py-0.5 text-sm font-semibold leading-none text-rose-600 hover:bg-white disabled:opacity-40"
                  title="Убрать из итога"
                >
                  ×
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-500">Нет страниц для редактирования</p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || pageCount <= 0 || pageOrder.length >= 500}
          onClick={addBlankPage}
          className="cursor-pointer rounded-lg border border-folio-200 bg-folio-50 px-3 py-1.5 text-xs font-medium text-folio-800 hover:bg-folio-100 disabled:opacity-50"
        >
          + Чистый лист
        </button>
        <button
          type="button"
          disabled={pending || pageCount <= 0}
          onClick={resetOrder}
          className="cursor-pointer rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          Сбросить порядок
        </button>
        <span className="self-center text-[11px] text-slate-400">
          {pageOrder.length} стр. в итоге
          {pageOrder.length !== pageCount ? ` (было ${pageCount})` : ''}
        </span>
      </div>

      <div className={reportActionsColumnClass}>
        <OperationSaveModeSelect
          value={saveMode}
          onChange={setSaveMode}
          versionNumber={versionNumber}
          canReplaceCurrent={isLatestVersion}
          disabled={pending}
        />
        <FeatureHelpActionButton
          helpTitle={
            saveMode === 'replace_current'
              ? 'Обновить текущую версию'
              : 'Сохранить порядок в новую версию'
          }
          disabled={!versionReady || pending || pageOrder.length === 0 || !orderChanged}
          onClick={() => void handleApply()}
          buttonClassName={reportActionBtnPrimary}
          helpContent={
            saveMode === 'replace_current' ? (
              <>
                <p>{HINT_PAGE_ORDER_SAVE_REPLACE_CURRENT}</p>
                <p>Дубликаты и чистые листы останутся отдельными страницами.</p>
              </>
            ) : (
              <>
                <p>
                  Соберёт PDF в указанном порядке. Дубликаты и чистые листы останутся отдельными
                  страницами.
                </p>
                <p>Нужна готовая версия с известным числом страниц (до 500 в итоге).</p>
              </>
            )
          }
        >
          {rearrangeLoading
            ? 'Запуск…'
            : saveMode === 'replace_current'
              ? 'Обновить текущую версию'
              : 'Сохранить в новую версию'}
        </FeatureHelpActionButton>
      </div>

      {blockedReason && <p className="text-xs text-amber-700">{blockedReason}</p>}
    </div>
  );
}
