import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useApplyLayoutPdfMutation, useGetJobQuery } from '@folio-mind/store';
import { normalizeLayoutObjectsForPdf, estimateLayoutObjectsBytes } from '../../lib/layout/normalizeLayoutImage.js';
import {
  FeatureHelpActionButton,
  FeatureHelpButton,
  reportActionBtnPrimaryStretch,
  reportActionsColumnClass,
} from '../ui/FeatureHelp.js';
import type { LayoutEditorState } from '../../hooks/useLayoutEditor.js';

type Props = {
  layout: LayoutEditorState;
  viewerPage: number;
  versionReady: boolean;
  documentId: string;
  versionId: string;
  pageCount?: number;
  onSelectVersion: (versionId: string) => void;
  onGoToPage: (page: number) => void;
  addNotice?: string | null;
  onAddImages?: (
    files: File[],
    options?: { distributeAcrossPages?: boolean },
  ) => Promise<void>;
};

function getMutationError(err: unknown): string {
  if (typeof err === 'object' && err && 'status' in err) {
    const status = (err as { status?: number }).status;
    if (status === 413) {
      return 'Изображения слишком большие для отправки. Удалите лишние или используйте файлы меньшего размера.';
    }
  }
  if (typeof err === 'object' && err && 'data' in err) {
    const data = (err as { data?: unknown }).data;
    if (typeof data === 'string') {
      if (/payload too large/i.test(data)) {
        return 'Изображения слишком большие для отправки. Удалите лишние или уменьшите файлы.';
      }
      return data;
    }
    if (typeof data === 'object' && data && 'error' in data) {
      return String((data as { error: string }).error);
    }
  }
  return 'Не удалось сохранить макет';
}

export function DocumentLayoutPanel({
  layout,
  viewerPage,
  versionReady,
  documentId,
  versionId,
  pageCount = 0,
  onSelectVersion,
  onGoToPage,
  addNotice = null,
  onAddImages,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusHint, setStatusHint] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [operationJobId, setOperationJobId] = useState<string | null>(null);
  const [pollOperation, setPollOperation] = useState(false);
  const [distributeAcrossPages, setDistributeAcrossPages] = useState(false);
  const [targetVersionId, setTargetVersionId] = useState<string | null>(null);

  const pagesWithObjects = useMemo(() => {
    return Object.entries(layout.objectCountByPage)
      .map(([page, count]) => ({ page: Number(page), count }))
      .sort((a, b) => a.page - b.page);
  }, [layout.objectCountByPage]);

  const [applyLayoutPdf, { isLoading: saving }] = useApplyLayoutPdfMutation();
  const { data: operationJob } = useGetJobQuery(operationJobId!, {
    skip: !operationJobId,
    pollingInterval: pollOperation ? 2000 : 0,
  });

  useEffect(() => {
    if (!operationJobId || !operationJob) return;
    if (operationJob.status === 'completed') {
      setPollOperation(false);
      const payload = operationJob.payload;
      const message =
        typeof payload === 'object' && payload && 'message' in payload
          ? String((payload as { message?: string }).message ?? 'Макет сохранён')
          : 'Макет сохранён в новую версию PDF';
      setStatusHint(message);
      if (targetVersionId) onSelectVersion(targetVersionId);
      setOperationJobId(null);
      setTargetVersionId(null);
      layout.setEnabled(false);
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
      setError(msg);
    }
  }, [layout, onSelectVersion, operationJob, operationJobId, targetVersionId]);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    event.target.value = '';
    if (!files || files.length === 0 || !onAddImages) return;
    setError(null);
    setAdding(true);
    try {
      await onAddImages(Array.from(files), { distributeAcrossPages });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось добавить изображение');
    } finally {
      setAdding(false);
    }
  }

  const selectedObject = layout.objects.find((object) => object.id === layout.selectedId);

  async function handleSaveLayout() {
    if (!versionId || layout.totalObjectCount === 0) return;
    setError(null);
    setStatusHint(null);
    try {
      setStatusHint('Подготовка изображений…');
      const objects = await normalizeLayoutObjectsForPdf(layout.objects);
      const totalBytes = estimateLayoutObjectsBytes(objects);
      const maxBytes = 12 * 1024 * 1024;
      if (totalBytes > maxBytes) {
        setError(
          `После сжатия изображения занимают ${Math.round(totalBytes / (1024 * 1024))} МБ (лимит ${maxBytes / (1024 * 1024)} МБ). Удалите часть картинок или уменьшите исходные файлы.`,
        );
        setStatusHint(null);
        return;
      }
      const result = await applyLayoutPdf({
        documentId,
        versionId,
        objects,
      }).unwrap();
      setOperationJobId(result.operationJobId);
      setTargetVersionId(result.versionId);
      setPollOperation(true);
      setStatusHint(`Создана версия ${result.version}. Worker встраивает изображения в PDF…`);
      onSelectVersion(result.versionId);
    } catch (err) {
      setError(getMutationError(err));
    }
  }

  const savePending =
    saving || Boolean(operationJobId && pollOperation && operationJob?.status !== 'failed');

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-600">
        Несколько файлов по умолчанию попадают на <strong>стр. {viewerPage}</strong> (слегка
        смещены — разведите по листу). Перетащите файлы на нужный лист в PDF. Включите «Режим
        макета», чтобы видеть сетку и картинки.
      </p>

      <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600">
        <input
          type="checkbox"
          checked={distributeAcrossPages}
          onChange={(e) => setDistributeAcrossPages(e.target.checked)}
          className="rounded border-slate-300"
        />
        По одной картинке на каждую следующую страницу (стр. {viewerPage}, {viewerPage + 1}…)
      </label>

      <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={layout.enabled}
          disabled={!versionReady}
          onChange={(e) => layout.setEnabled(e.target.checked)}
          className="rounded border-slate-300"
        />
        Режим макета в просмотрщике
      </label>

      <div className="flex flex-wrap gap-3 text-xs text-slate-600">
        <label className="flex cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            checked={layout.showRulers}
            onChange={(e) => layout.setShowRulers(e.target.checked)}
            className="rounded border-slate-300"
          />
          Линейки (мм)
        </label>
        <label className="flex cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            checked={layout.showGrid}
            onChange={(e) => layout.setShowGrid(e.target.checked)}
            className="rounded border-slate-300"
          />
          Сетка
        </label>
        <label className="flex cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            checked={layout.snapEnabled}
            onChange={(e) => layout.setSnapEnabled(e.target.checked)}
            className="rounded border-slate-300"
          />
          Привязка к сетке
        </label>
      </div>

      <label className="block text-xs text-slate-600">
        Шаг сетки (мм)
        <input
          type="number"
          min={5}
          max={50}
          step={5}
          value={layout.gridStepMm}
          onChange={(e) => layout.setGridStepMm(Number(e.target.value) || 10)}
          className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
        />
      </label>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => void handleFileChange(e)}
      />

      {layout.selectedId && selectedObject && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2">
          <span className="text-xs text-slate-600">
            Выбрано · стр. {selectedObject.page} · {selectedObject.rotation ?? 0}°
          </span>
          <button
            type="button"
            disabled={savePending}
            onClick={() => layout.rotateSelected(-90)}
            className="cursor-pointer rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            ↺ 90°
          </button>
          <button
            type="button"
            disabled={savePending}
            onClick={() => layout.rotateSelected(90)}
            className="cursor-pointer rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            90° ↻
          </button>
        </div>
      )}

      <div className={reportActionsColumnClass}>
        <FeatureHelpActionButton
          helpTitle="Добавить изображение"
          stretch
          disabled={!versionReady || adding || savePending}
          onClick={() => fileInputRef.current?.click()}
          buttonClassName={reportActionBtnPrimaryStretch}
          helpContent={
            <p>
              По умолчанию все выбранные файлы — на текущую стр. {viewerPage}. Включите
              «По одной на каждую следующую страницу» для буклета. Перетаскивание с рабочего стола
              — на тот лист, куда бросили.
            </p>
          }
        >
          {adding ? 'Загрузка…' : 'Добавить изображение'}
        </FeatureHelpActionButton>
        <FeatureHelpActionButton
          helpTitle="Сохранить макет в новую версию"
          stretch
          disabled={!versionReady || layout.totalObjectCount === 0 || savePending}
          onClick={() => void handleSaveLayout()}
          buttonClassName={reportActionBtnPrimaryStretch}
          helpContent={
            <>
              <p>
                Worker встроит все изображения из черновика в копию PDF и создаст новую версию в
                списке слева (как после «Сжать» или «Объединить»).
              </p>
              <p>PNG, JPEG и WebP (WebP автоматически конвертируется в PNG). До 12 МБ суммарно.</p>
            </>
          }
        >
          {saving ? 'Запуск…' : savePending ? 'Сохраняем…' : 'Сохранить в PDF'}
        </FeatureHelpActionButton>
        <button
          type="button"
          disabled={!layout.selectedId || savePending}
          onClick={() => layout.removeSelected()}
          className="cursor-pointer rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Удалить выбранное
        </button>
      </div>

      <div className="flex flex-nowrap items-center gap-1.5">
        <p className="min-w-0 text-[11px] text-slate-500">
          На странице: {layout.pageObjectCount} · всего в черновике: {layout.totalObjectCount}
        </p>
        <FeatureHelpButton title="Черновик и финал" corner>
          <p>
            Пока вы расставляете картинки, черновик живёт в браузере (sessionStorage). После
            «Сохранить в PDF» изображения попадают в настоящий PDF на сервере — их видно в обычном
            просмотре и при скачивании.
          </p>
        </FeatureHelpButton>
      </div>

      {pagesWithObjects.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-700">
          <p className="mb-1.5 font-medium text-slate-800">Картинки в черновике</p>
          <ul className="space-y-1">
            {pagesWithObjects.map(({ page, count }) => (
              <li key={page} className="flex items-center justify-between gap-2">
                <span>
                  Стр. {page} — {count}{' '}
                  {count === 1 ? 'картинка' : count < 5 ? 'картинки' : 'картинок'}
                  {page === viewerPage ? ' (сейчас открыта)' : ''}
                </span>
                {page !== viewerPage && (
                  <button
                    type="button"
                    className="shrink-0 cursor-pointer font-medium text-folio-700 underline hover:text-folio-900"
                    onClick={() => onGoToPage(page)}
                  >
                    Перейти
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {addNotice && (
        <p className="rounded-lg border border-folio-200 bg-folio-50/80 px-3 py-2 text-sm text-folio-800">
          {addNotice}
        </p>
      )}

      {statusHint && <p className="text-sm text-folio-700">{statusHint}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
