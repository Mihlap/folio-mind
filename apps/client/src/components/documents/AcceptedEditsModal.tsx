import { useEffect, useRef, useState } from 'react';
import type { DocumentAnnotation } from '@folio-mind/store';
import { AcceptedEditBeforeAfter } from './AcceptedEditBeforeAfter.js';
import { MarkdownPreview } from './MarkdownPreview.js';

const EDIT_FIELD_ROWS = 8;
type Props = {
  open: boolean;
  edits: DocumentAnnotation[];
  pageFilter?: number | null;
  focusedId?: string | null;
  onClose: () => void;
  onGoToPage: (page: number, annotationId?: string) => void;
  onDelete?: (annotationId: string) => void;
  onUpdate?: (
    annotationId: string,
    payload: {
      quote: string;
      content: string;
      contentFormat?: 'plain' | 'markdown';
    },
  ) => void | Promise<void>;
  saving?: boolean;
};
export function AcceptedEditsModal({
  open,
  edits,
  pageFilter = null,
  focusedId,
  onClose,
  onGoToPage,
  onDelete,
  onUpdate,
  saving = false,
}: Props) {
  const itemRefs = useRef<Map<string, HTMLLIElement>>(new Map());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftBefore, setDraftBefore] = useState('');
  const [draftAfter, setDraftAfter] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  useEffect(() => {
    if (!open || !focusedId) return;
    const el = itemRefs.current.get(focusedId);
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [open, focusedId]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editingId) {
          setEditingId(null);
          setEditError(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, editingId]);
  useEffect(() => {
    if (!open) {
      setEditingId(null);
      setEditError(null);
    }
  }, [open]);
  function startEdit(item: DocumentAnnotation) {
    setEditingId(item.id);
    setDraftBefore(item.quote ?? '');
    setDraftAfter(item.content);
    setEditError(null);
  }
  async function saveEdit(annotationId: string) {
    const quote = draftBefore.trim();
    const content = draftAfter.trim();
    if (!quote || !content) {
      setEditError('Заполните «было» и «стало»');
      return;
    }
    if (!onUpdate) return;
    setEditError(null);
    try {
      await onUpdate(annotationId, { quote, content, contentFormat: 'markdown' });
      setEditingId(null);
    } catch {
      setEditError('Не удалось сохранить правку');
    }
  }
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[130] flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="accepted-edits-modal-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-slate-900/50"
        aria-label="Закрыть"
        onClick={onClose}
      />
      <div className="relative flex max-h-[min(92vh,900px)] min-h-[min(70vh,640px)] w-[min(96vw,56rem)] max-w-none resize flex-col overflow-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 id="accepted-edits-modal-title" className="text-base font-semibold text-slate-900">
            Правки «было / стало»
            {pageFilter != null && (
              <span className="ml-1 text-sm font-normal text-slate-500">· стр. {pageFilter}</span>
            )}
            {edits.length > 0 && (
              <span className="ml-2 text-sm font-normal text-slate-500">({edits.length})</span>
            )}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            Закрыть
          </button>
        </div>

        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {edits.length === 0 ? (
            <p className="text-sm text-slate-500">
              Нет правок. Добавьте свою в «Инструменты → Правки в PDF» или примите предложение ИИ
              там же.
            </p>
          ) : (
            <ul className="space-y-4">
              {edits.map((item) => {
                const isEditing = editingId === item.id;
                return (
                  <li
                    key={item.id}
                    ref={(el) => {
                      if (el) itemRefs.current.set(item.id, el);
                      else itemRefs.current.delete(item.id);
                    }}
                    className={`rounded-xl border p-3 ${
                      focusedId === item.id
                        ? 'border-folio-500 bg-folio-50/30 ring-2 ring-folio-200'
                        : 'border-slate-200 bg-slate-50/50'
                    }`}
                  >
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onGoToPage(item.page, item.id)}
                        className="cursor-pointer rounded-md bg-white px-2 py-0.5 text-xs font-medium text-folio-700 ring-1 ring-folio-200 hover:bg-folio-50"
                      >
                        Стр. {item.page}
                      </button>
                      {!isEditing && onUpdate && (
                        <button
                          type="button"
                          title="Редактировать правку"
                          onClick={() => startEdit(item)}
                          className="cursor-pointer text-xs font-medium text-folio-700 hover:text-folio-900"
                        >
                          Редактировать
                        </button>
                      )}
                      {onDelete && !isEditing && (
                        <button
                          type="button"
                          title="Удалить правку"
                          onClick={() => onDelete(item.id)}
                          className="ml-auto cursor-pointer text-xs text-slate-400 hover:text-red-600"
                        >
                          Удалить
                        </button>
                      )}
                    </div>

                    {isEditing ? (
                      <div className="space-y-3">
                        <div className="space-y-1">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-red-700">
                            Было
                          </p>
                          <textarea
                            value={draftBefore}
                            onChange={(e) => setDraftBefore(e.target.value)}
                            disabled={saving}
                            rows={EDIT_FIELD_ROWS}
                            placeholder="Было…"
                            className="min-h-[8rem] w-full resize-y rounded-lg border border-red-100 bg-red-50/50 px-3 py-2 text-sm leading-relaxed disabled:opacity-50"
                          />
                        </div>
                        <div className="space-y-1">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                            Стало (Markdown)
                          </p>
                          <textarea
                            value={draftAfter}
                            onChange={(e) => setDraftAfter(e.target.value)}
                            disabled={saving}
                            rows={EDIT_FIELD_ROWS}
                            placeholder={`- • пункт списка
- **жирный** текст
- формула $E=mc^2$`}
                            className="min-h-[8rem] w-full resize-y rounded-lg border border-emerald-100 bg-emerald-50/50 px-3 py-2 font-mono text-sm leading-relaxed disabled:opacity-50"
                          />
                          <div className="rounded-lg border border-emerald-100 bg-white p-2">
                            <p className="mb-1 text-[10px] font-medium text-slate-500">Превью</p>
                            <MarkdownPreview markdown={draftAfter} />
                          </div>
                        </div>
                        {editError && <p className="text-xs text-red-600">{editError}</p>}
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => void saveEdit(item.id)}
                            className="cursor-pointer rounded-lg bg-folio-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-folio-700 disabled:opacity-50"
                          >
                            {saving ? 'Сохранение…' : 'Сохранить'}
                          </button>
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => {
                              setEditingId(null);
                              setEditError(null);
                            }}
                            className="cursor-pointer rounded-lg px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                          >
                            Отмена
                          </button>
                        </div>
                      </div>
                    ) : item.quote ? (
                      <AcceptedEditBeforeAfter
                        large
                        before={item.quote}
                        after={item.content}
                        afterFormat={item.contentFormat}
                      />
                    ) : (
                      <p className="text-sm text-slate-700">{item.content}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
