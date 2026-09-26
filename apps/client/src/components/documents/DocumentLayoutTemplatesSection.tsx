import { useEffect, useState } from 'react';
import {
  useCreateLayoutTemplateMutation,
  useDeleteLayoutTemplateMutation,
  useListLayoutTemplatesQuery,
  serializePageToTemplate,
  type LayoutTemplateCategory,
  type LayoutTemplateStoredObject,
  type LayoutTemplateItem,
} from '@folio-mind/store';
import type { LayoutEditorState } from '../../hooks/useLayoutEditor.js';

const CATEGORY_LABELS: Record<LayoutTemplateCategory, string> = {
  cover: 'Обложка',
  spread: 'Разворот',
  'three-renders': 'Три рендера',
  custom: 'Свой',
};

function defaultSaveName(viewerPage: number): string {
  return `Макет стр. ${viewerPage}`;
}

type Props = {
  layout: LayoutEditorState;
  viewerPage: number;
  displayPageCount: number;
  versionReady: boolean;
  onGoToPage?: (page: number) => void;
};

export function DocumentLayoutTemplatesSection({
  layout,
  viewerPage,
  displayPageCount,
  versionReady,
  onGoToPage,
}: Props) {
  const { data, isLoading } = useListLayoutTemplatesQuery();
  const [createTemplate, { isLoading: saving }] = useCreateLayoutTemplateMutation();
  const [deleteTemplate] = useDeleteLayoutTemplateMutation();
  const [selectedId, setSelectedId] = useState('');
  const [saveName, setSaveName] = useState('');
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [insertAfterPage, setInsertAfterPage] = useState(viewerPage);

  const blankPageOptions = Math.max(1, displayPageCount);

  useEffect(() => {
    setInsertAfterPage((prev) => Math.min(Math.max(1, prev), blankPageOptions));
  }, [blankPageOptions]);

  const items = data?.items ?? [];
  const selected = items.find((item) => item.id === selectedId) ?? items[0] ?? null;

  function openSaveForm() {
    setSaveError(null);
    setApplyError(null);
    setStatus(null);
    setSaveName(defaultSaveName(viewerPage));
    setShowSaveForm(true);
  }

  function closeSaveForm() {
    setShowSaveForm(false);
    setSaveError(null);
    setSaveName('');
  }

  async function handleApply(template: LayoutTemplateItem) {
    if (!versionReady) return;
    setApplyError(null);
    setSaveError(null);
    setStatus(null);
    closeSaveForm();
    try {
      if (!layout.enabled) layout.setEnabled(true);
      const objects = template.objects as LayoutTemplateStoredObject[];
      const created = layout.applyTemplate(objects, viewerPage);
      if (created.length === 0) {
        setApplyError('Шаблон пуст');
        return;
      }
      setStatus(
        `Шаблон «${template.name}» на стр. ${viewerPage}. Серые блоки — слоты под фото; перетащите изображение из медиатеки.`,
      );
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : 'Не удалось применить шаблон');
    }
  }

  async function handleApplyOnBlankPage(template: LayoutTemplateItem) {
    if (!versionReady) return;
    setApplyError(null);
    setSaveError(null);
    setStatus(null);
    closeSaveForm();
    try {
      if (!layout.enabled) layout.setEnabled(true);
      const objects = template.objects as LayoutTemplateStoredObject[];
      const result = layout.applyTemplateOnBlankPage(objects, { insertAfterPage });
      if (result.created.length === 0) {
        setApplyError('Шаблон пуст');
        return;
      }
      onGoToPage?.(result.targetPage);
      setStatus(
        `Шаблон «${template.name}» на новом листе после стр. ${result.displayInsertAfter} (стр. ${result.targetPage}). Нажмите «Сохранить в PDF», чтобы вставить страницу в документ.`,
      );
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : 'Не удалось применить на чистый лист');
    }
  }

  async function handleSavePage() {
    const name = saveName.trim() || defaultSaveName(viewerPage);
    const objects = serializePageToTemplate(layout.objects, viewerPage);
    if (objects.length === 0) {
      setSaveError(`На стр. ${viewerPage} нет объектов макета — сначала добавьте фигуры или фото`);
      return;
    }
    setSaveError(null);
    setApplyError(null);
    try {
      await createTemplate({ name, category: 'custom', objects }).unwrap();
      closeSaveForm();
      setStatus(`Шаблон «${name}» сохранён`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Не удалось сохранить шаблон');
    }
  }

  async function handleDelete(template: LayoutTemplateItem) {
    if (template.builtin) return;
    if (!window.confirm(`Удалить шаблон «${template.name}»?`)) return;
    setApplyError(null);
    setSaveError(null);
    try {
      await deleteTemplate(template.id).unwrap();
      if (selectedId === template.id) setSelectedId('');
      setStatus('Шаблон удалён');
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : 'Не удалось удалить');
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5">
      <div>
        <p className="text-xs font-medium text-slate-700">Шаблоны бюро</p>
        <p className="mt-0.5 text-[11px] text-slate-500">
          Выберите макет и нажмите «Применить» — объекты появятся на PDF (нужен режим макета).
        </p>
      </div>

      {isLoading && <p className="text-xs text-slate-500">Загрузка…</p>}

      {!isLoading && items.length === 0 && (
        <p className="text-xs text-slate-500">Шаблоны недоступны — проверьте интернет или обновите страницу.</p>
      )}

      {!isLoading && items.length > 0 && (
        <div className="space-y-2 rounded-md border border-slate-200 bg-white p-2.5">
          <label className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[10px] font-medium text-slate-600">Применить шаблон</span>
            <select
              value={selected?.id ?? ''}
              onChange={(e) => {
                setSelectedId(e.target.value);
                setApplyError(null);
              }}
              className="rounded border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800"
            >
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.builtin ? '★ ' : ''}
                  {item.name}
                  {item.category !== 'custom' ? ` · ${CATEGORY_LABELS[item.category]}` : ''}
                </option>
              ))}
            </select>
          </label>

          {selected?.description && (
            <p className="text-[11px] text-slate-500">{selected.description}</p>
          )}

          <label className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[10px] font-medium text-slate-600">Вставить чистый лист после</span>
            <select
              value={insertAfterPage}
              onChange={(e) => setInsertAfterPage(Number(e.target.value))}
              className="rounded border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800"
            >
              {Array.from({ length: blankPageOptions }, (_, index) => index + 1).map((page) => (
                <option key={page} value={page}>
                  стр. {page}
                  {page === viewerPage ? ' (сейчас открыта)' : ''}
                  {page === blankPageOptions ? ' — в конец' : ''}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!versionReady || !selected}
              onClick={() => selected && void handleApply(selected)}
              className="cursor-pointer rounded border border-folio-300 bg-folio-600 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-folio-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Применить на стр. {viewerPage}
            </button>
            <button
              type="button"
              disabled={!versionReady || !selected}
              onClick={() => selected && void handleApplyOnBlankPage(selected)}
              className="cursor-pointer rounded border border-folio-200 bg-white px-3 py-1.5 text-[11px] font-medium text-folio-700 hover:bg-folio-50 disabled:cursor-not-allowed disabled:opacity-50"
              title="Добавит чистый лист в выбранное место при сохранении в PDF"
            >
              Применить на чистый лист
            </button>
            {selected && !selected.builtin && (
              <button
                type="button"
                onClick={() => void handleDelete(selected)}
                className="cursor-pointer rounded border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-600 hover:bg-slate-50"
              >
                Удалить шаблон
              </button>
            )}
          </div>
        </div>
      )}

      <div className="border-t border-slate-200 pt-2">
        {!showSaveForm ? (
          <button
            type="button"
            disabled={!versionReady}
            onClick={openSaveForm}
            className="cursor-pointer text-[11px] font-medium text-folio-700 underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
          >
            Сохранить текущую страницу как свой шаблон…
          </button>
        ) : (
          <div className="space-y-2 rounded-md border border-dashed border-slate-300 bg-white p-2.5">
            <p className="text-[10px] font-medium text-slate-600">Сохранить макет стр. {viewerPage}</p>
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[10px] text-slate-500">Название шаблона</span>
                <input
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleSavePage();
                  }}
                  className="rounded border border-slate-200 bg-white px-2 py-1.5 text-xs"
                />
              </label>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSavePage()}
                className="cursor-pointer rounded border border-folio-200 bg-folio-50 px-3 py-1.5 text-[11px] font-medium text-folio-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? '…' : 'Сохранить'}
              </button>
              <button
                type="button"
                onClick={closeSaveForm}
                className="cursor-pointer text-[11px] text-slate-500 hover:text-slate-700"
              >
                Отмена
              </button>
            </div>
          </div>
        )}
      </div>

      {status && <p className="text-[11px] text-emerald-700">{status}</p>}
      {applyError && (
        <p className="rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-700" role="alert">
          {applyError}
        </p>
      )}
      {saveError && (
        <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-900" role="alert">
          {saveError}
        </p>
      )}
    </div>
  );
}
