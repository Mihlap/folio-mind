import { useEffect, useId, useState, type ClipboardEvent, type MouseEvent } from 'react';
import { normalizeMarkdownInput } from '@folio-mind/edit-markdown';
import {
  ExpandableFieldDialog,
} from './ExpandableEditField.js';
import { MarkdownPreview } from './MarkdownPreview.js';
import { insertTextAtSelection, pasteMarkdownFromClipboard } from './markdownPaste.js';

type Props = {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
  fieldClassName: string;
};

const MARKDOWN_HINT =
  'Списки: каждый пункт с новой строки (- пункт или • пункт). При вставке из Word переносы подставятся автоматически.';

export function ExpandableMarkdownEditField({
  id,
  label,
  value,
  onChange,
  placeholder,
  disabled = false,
  fieldClassName,
}: Props) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [showPreview, setShowPreview] = useState(true);

  useEffect(() => {
    if (!open) setDraft(value);
  }, [value, open]);

  function openEditor() {
    if (disabled) return;
    setDraft(value);
    setOpen(true);
  }

  function save() {
    onChange(normalizeMarkdownInput(draft));
    setOpen(false);
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const inserted = pasteMarkdownFromClipboard(event.clipboardData);
    if (!inserted) return;
    event.preventDefault();
    const textarea = event.currentTarget;
    const { selectionStart, selectionEnd } = textarea;
    const { next, caret } = insertTextAtSelection(draft, selectionStart, selectionEnd, inserted);
    setDraft(next);
    requestAnimationFrame(() => {
      textarea.setSelectionRange(caret, caret);
    });
  }

  function clearField(e: MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    onChange('');
    setDraft('');
  }

  const hasValue = value.trim().length > 0;

  return (
    <>
      <div className="relative">
        <button
          type="button"
          id={fieldId}
          disabled={disabled}
          onClick={openEditor}
          className={`${fieldClassName} min-h-[3.25rem] w-full cursor-pointer rounded-lg border px-3 py-2 text-left outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 disabled:opacity-50 ${hasValue ? 'pr-9' : ''}`}
        >
          {hasValue ? (
            <MarkdownPreview markdown={value} className="text-sm" />
          ) : (
            <span className="whitespace-pre-line text-sm text-slate-400">{placeholder}</span>
          )}
        </button>
        {hasValue && (
          <button
            type="button"
            disabled={disabled}
            onClick={clearField}
            title="Очистить"
            className="absolute top-2 right-2 cursor-pointer rounded p-0.5 text-base text-slate-400 hover:bg-white/80 hover:text-red-600 disabled:opacity-50"
            aria-label={`Очистить: ${label}`}
          >
            ✕
          </button>
        )}
        <p className="mt-1 text-[10px] text-slate-400">{MARKDOWN_HINT}</p>
      </div>

      {open && (
        <ExpandableFieldDialog
          fieldId={fieldId}
          label={label}
          dialogHint="Пишите в Markdown — справа превью. «Было» остаётся plain text из PDF."
          open={open}
          onClose={() => setOpen(false)}
          footer={
            <>
              <button
                type="button"
                onClick={() => {
                  setDraft('');
                  onChange('');
                  setOpen(false);
                }}
                className="mr-auto cursor-pointer rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:bg-red-50 hover:text-red-600"
              >
                Очистить
              </button>
              <button
                type="button"
                onClick={() => setShowPreview((v) => !v)}
                className="cursor-pointer rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                {showPreview ? 'Скрыть превью' : 'Показать превью'}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="cursor-pointer rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={save}
                className="cursor-pointer rounded-lg bg-folio-600 px-4 py-2 text-sm font-medium text-white hover:bg-folio-700"
              >
                Сохранить
              </button>
            </>
          }
        >
          <div className="flex min-h-0 flex-1 flex-col">
            <div
              className={`grid min-h-0 flex-1 gap-3 ${showPreview ? 'lg:grid-cols-2' : 'grid-cols-1'}`}
              style={{ gridAutoRows: '1fr' }}
            >
              <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
                <p className="shrink-0 border-b border-slate-100 px-3 py-2 text-[11px] font-medium text-slate-600">
                  Markdown
                </p>
                <textarea
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onPaste={handlePaste}
                  placeholder={placeholder}
                  className="min-h-0 w-full flex-1 resize-none border-0 bg-emerald-50/30 px-3 py-2 text-sm outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400/40"
                />
              </div>
              {showPreview && (
                <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
                  <p className="shrink-0 border-b border-slate-100 px-3 py-2 text-[11px] font-medium text-slate-600">
                    Превью
                  </p>
                  <div className="min-h-0 flex-1 overflow-auto p-3">
                    <MarkdownPreview markdown={draft} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </ExpandableFieldDialog>
      )}
    </>
  );
}
