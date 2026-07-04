import { useState } from 'react';
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

type Props = {
  layout: LayoutEditorState;
  viewerPage: number;
  versionReady: boolean;
};

export function DocumentLayoutTemplatesSection({ layout, viewerPage, versionReady }: Props) {
  const { data, isLoading } = useListLayoutTemplatesQuery();
  const [createTemplate, { isLoading: saving }] = useCreateLayoutTemplateMutation();
  const [deleteTemplate] = useDeleteLayoutTemplateMutation();
  const [selectedId, setSelectedId] = useState('');
  const [saveName, setSaveName] = useState('');
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const items = data?.items ?? [];
  const selected = items.find((item) => item.id === selectedId) ?? items[0] ?? null;

  async function handleApply(template: LayoutTemplateItem) {
    if (!versionReady) return;
    setError(null);
    setStatus(null);
    try {
      if (!layout.enabled) layout.setEnabled(true);
      const objects = template.objects as LayoutTemplateStoredObject[];
      const created = layout.applyTemplate(objects, viewerPage);
      if (created.length === 0) {
        setError('Шаблон пуст');
        return;
      }
      setStatus(`Шаблон «${template.name}» на стр. ${viewerPage}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось применить шаблон');
    }
  }

  async function handleSavePage() {
    const name = saveName.trim();
    if (!name) {
      setError('Укажите название шаблона');
      return;
    }
    const objects = serializePageToTemplate(layout.objects, viewerPage);
    if (objects.length === 0) {
      setError(`На стр. ${viewerPage} нет объектов макета`);
      return;
    }
    setError(null);
    try {
      await createTemplate({ name, category: 'custom', objects }).unwrap();
      setSaveName('');
      setShowSaveForm(false);
      setStatus(`Шаблон «${name}» сохранён`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить шаблон');
    }
  }

  async function handleDelete(template: LayoutTemplateItem) {
    if (template.builtin) return;
    if (!window.confirm(`Удалить шаблон «${template.name}»?`)) return;
    setError(null);
    try {
      await deleteTemplate(template.id).unwrap();
      if (selectedId === template.id) setSelectedId('');
      setStatus('Шаблон удалён');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить');
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5">
      <p className="text-xs font-medium text-slate-700">Шаблоны бюро</p>
      <p className="text-[11px] text-slate-500">
        Встроенные макеты и сохранённые шаблоны tenant. Слоты под фото — серые блоки; перетащите
        изображение из медиатеки или с рабочего стола.
      </p>

      {isLoading && <p className="text-xs text-slate-500">Загрузка…</p>}

      {!isLoading && items.length > 0 && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[10px] text-slate-500">Шаблон</span>
            <select
              value={selected?.id ?? ''}
              onChange={(e) => setSelectedId(e.target.value)}
              className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800"
            >
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.builtin ? '★ ' : ''}
                  {item.name} ({CATEGORY_LABELS[item.category] ?? item.category})
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={!versionReady || !selected}
            onClick={() => selected && void handleApply(selected)}
            className="shrink-0 rounded border border-folio-200 bg-folio-50 px-2 py-1 text-[11px] font-medium text-folio-800 hover:bg-folio-100 disabled:opacity-50"
          >
            На стр. {viewerPage}
          </button>
          {selected && !selected.builtin && (
            <button
              type="button"
              onClick={() => void handleDelete(selected)}
              className="shrink-0 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
            >
              Удалить
            </button>
          )}
        </div>
      )}

      {selected?.description && (
        <p className="text-[11px] text-slate-500">{selected.description}</p>
      )}

      {!showSaveForm ? (
        <button
          type="button"
          disabled={!versionReady}
          onClick={() => setShowSaveForm(true)}
          className="text-[11px] font-medium text-folio-700 underline-offset-2 hover:underline disabled:opacity-50"
        >
          Сохранить текущую страницу как шаблон…
        </button>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[10px] text-slate-500">Название</span>
            <input
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder={`Стр. ${viewerPage}`}
              className="rounded border border-slate-200 bg-white px-2 py-1 text-xs"
            />
          </label>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSavePage()}
            className="rounded border border-folio-200 bg-folio-50 px-2 py-1 text-[11px] font-medium text-folio-800 disabled:opacity-50"
          >
            {saving ? '…' : 'Сохранить'}
          </button>
          <button
            type="button"
            onClick={() => setShowSaveForm(false)}
            className="text-[11px] text-slate-500 hover:text-slate-700"
          >
            Отмена
          </button>
        </div>
      )}

      {status && <p className="text-[11px] text-emerald-700">{status}</p>}
      {error && (
        <p className="rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
