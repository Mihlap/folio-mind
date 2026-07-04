import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useApplyLayoutPdfMutation, useGetJobQuery, LAYOUT_MARGIN_PRESETS, isLayoutImageObject, isLayoutShapeObject, DEFAULT_LAYOUT_SOLID_FILL, DEFAULT_LAYOUT_GRADIENT_FILL } from '@folio-mind/store';
import { normalizeLayoutObjectsForPdf, estimateLayoutObjectsBytes } from '../../lib/layout/normalizeLayoutImage.js';
import {
  FeatureHelpActionButton,
  FeatureHelpButton,
  reportActionBtnPrimaryStretch,
  reportActionsColumnClass,
} from '../ui/FeatureHelp.js';
import type { LayoutEditorState } from '../../hooks/useLayoutEditor.js';
import { MediaLibraryInsertPanel } from './MediaLibraryInsertPanel.js';
import { DocumentLayoutTemplatesSection } from './DocumentLayoutTemplatesSection.js';

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
    options?: { distributeAcrossPages?: boolean; startPage?: number },
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
  const replaceImageInputRef = useRef<HTMLInputElement>(null);
  const insertStartPageRef = useRef(viewerPage);
  const [error, setError] = useState<string | null>(null);
  const [statusHint, setStatusHint] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [operationJobId, setOperationJobId] = useState<string | null>(null);
  const [pollOperation, setPollOperation] = useState(false);
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
    insertStartPageRef.current = viewerPage;
  }, [viewerPage]);

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
    const selected = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (selected.length === 0) {
      setError('Не удалось прочитать выбранные файлы. Попробуйте снова.');
      return;
    }
    if (!onAddImages) {
      setError('Добавление изображений недоступно. Обновите страницу.');
      return;
    }
    setError(null);
    setAdding(true);
    try {
      await onAddImages(selected, {
        distributeAcrossPages: layout.distributeAcrossPages,
        startPage: insertStartPageRef.current,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось добавить изображение');
    } finally {
      setAdding(false);
    }
  }

  const selectedObject = layout.objects.find((object) => object.id === layout.selectedId);
  const selectedImage = selectedObject && isLayoutImageObject(selectedObject) ? selectedObject : null;
  const selectedShape = selectedObject && isLayoutShapeObject(selectedObject) ? selectedObject : null;
  const selectedSolidFill = selectedShape?.fill.type === 'solid' ? selectedShape.fill : null;

  async function handleSaveLayout() {
    if (!versionId || layout.totalObjectCount === 0) return;
    setError(null);
    setStatusHint(null);
    try {
      setStatusHint('Подготовка изображений…');
      const objects = await normalizeLayoutObjectsForPdf(
        layout.objects,
        layout.pageWidthPt,
        layout.pageHeightPt,
      );
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
        смещены — разведите по листу). Перетащите файлы на лист, с которого начнётся вставка.
        Включите «По одной на каждую следующую страницу» — тогда и кнопка, и перетаскивание
        распределят файлы по стр. {viewerPage}, {viewerPage + 1}…
      </p>

      <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600">
        <input
          type="checkbox"
          checked={layout.distributeAcrossPages}
          onChange={(e) => layout.setDistributeAcrossPages(e.target.checked)}
          className="rounded border-slate-300"
        />
        По одной картинке на каждую следующую страницу (стр. {viewerPage}
        {pageCount > 0 ? `–${Math.min(viewerPage + 2, pageCount)}` : `, ${viewerPage + 1}…`})
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
        Поля листа (A4 / A3)
        <select
          value={layout.marginPresetId}
          onChange={(e) => layout.setMarginPresetId(e.target.value as typeof layout.marginPresetId)}
          className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
        >
          {LAYOUT_MARGIN_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600">
        <input
          type="checkbox"
          checked={layout.showPageGuides}
          disabled={layout.marginPresetId === 'none'}
          onChange={(e) => layout.setShowPageGuides(e.target.checked)}
          className="rounded border-slate-300"
        />
        Показать направляющие (зелёное — безопасное поле, розовое — вылет)
      </label>

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
            {selectedShape ? ' · подложка' : ''}
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
          {selectedImage && (
            <>
              <button
                type="button"
                disabled={savePending || !layout.pageGuides}
                onClick={() => layout.fitSelectedToSafeArea()}
                className="cursor-pointer rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                Вписать в поля
              </button>
              <button
                type="button"
                disabled={savePending}
                onClick={() => layout.setCropMode(!layout.cropMode)}
                className={[
                  'cursor-pointer rounded-md border px-2 py-1 text-xs disabled:opacity-40',
                  layout.cropMode
                    ? 'border-amber-300 bg-amber-50 text-amber-900'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                ].join(' ')}
              >
                {layout.cropMode ? 'Обрезка вкл.' : 'Обрезка'}
              </button>
              <button
                type="button"
                disabled={savePending}
                onClick={() => layout.resetSelectedCrop()}
                className="cursor-pointer rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                Сбросить обрезку
              </button>
              <button
                type="button"
                disabled={savePending}
                onClick={() => replaceImageInputRef.current?.click()}
                className="cursor-pointer rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                Заменить фото
              </button>
              <label className="flex w-full flex-col gap-0.5 text-xs text-slate-600">
                Подпись под рендером
                <input
                  type="text"
                  value={selectedImage.caption ?? ''}
                  disabled={savePending}
                  onChange={(e) => layout.updateSelectedCaption(e.target.value)}
                  placeholder="Из имени файла или вручную"
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
                />
              </label>
              <button
                type="button"
                disabled={savePending}
                onClick={() => layout.autoCaptionSelected()}
                className="cursor-pointer rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                Из имени файла
              </button>
            </>
          )}
          {selectedImage && (
            <div className="flex flex-wrap gap-1">
              {(
                [
                  ['left', '←'],
                  ['center', '◎'],
                  ['right', '→'],
                  ['top', '↑'],
                  ['middle', '↕'],
                  ['bottom', '↓'],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  disabled={savePending}
                  onClick={() => layout.alignSelected(mode)}
                  className="cursor-pointer rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {selectedSolidFill && selectedShape && (
            <>
              <label className="flex items-center gap-1.5 text-xs text-slate-600">
                Цвет
                <input
                  type="color"
                  value={selectedSolidFill.color}
                  disabled={savePending}
                  onChange={(e) =>
                    layout.updateShapeFill(selectedShape.id, {
                      type: 'solid',
                      color: e.target.value,
                      opacity: selectedSolidFill.opacity,
                    })
                  }
                  className="h-7 w-10 cursor-pointer rounded border border-slate-200"
                />
              </label>
              <label className="flex items-center gap-1.5 text-xs text-slate-600">
                Прозрачность
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={selectedSolidFill.opacity ?? 1}
                  disabled={savePending}
                  onChange={(e) =>
                    layout.updateShapeFill(selectedShape.id, {
                      type: 'solid',
                      color: selectedSolidFill.color,
                      opacity: Number(e.target.value),
                    })
                  }
                  className="w-24"
                />
              </label>
            </>
          )}
        </div>
      )}

      <input
        ref={replaceImageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            void layout.replaceSelectedImageSrc(String(reader.result));
          };
          reader.readAsDataURL(file);
        }}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!versionReady || savePending}
          onClick={() => layout.addShape(DEFAULT_LAYOUT_SOLID_FILL, viewerPage)}
          className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40"
        >
          + Заливка
        </button>
        <button
          type="button"
          disabled={!versionReady || savePending}
          onClick={() => layout.addShape(DEFAULT_LAYOUT_GRADIENT_FILL, viewerPage)}
          className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40"
        >
          + Градиент
        </button>
      </div>

      <DocumentLayoutTemplatesSection
        layout={layout}
        viewerPage={viewerPage}
        versionReady={versionReady}
      />

      <MediaLibraryInsertPanel
        documentId={documentId}
        versionReady={versionReady}
        viewerPage={viewerPage}
        onInsertAsset={async (_asset, dataUrl) => {
          if (!layout.enabled) layout.setEnabled(true);
          await layout.addImageFromDataUrl(dataUrl, viewerPage);
        }}
      />

      <div className={reportActionsColumnClass}>
        <FeatureHelpActionButton
          helpTitle="Добавить изображение"
          stretch
          disabled={!versionReady || adding || savePending}
          onClick={() => {
            insertStartPageRef.current = viewerPage;
            fileInputRef.current?.click();
          }}
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
