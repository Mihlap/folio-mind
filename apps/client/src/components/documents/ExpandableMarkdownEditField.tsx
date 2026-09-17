import { useEffect, useId, useRef, useState, type ClipboardEvent, type MouseEvent } from 'react';
import { normalizeMarkdownInput } from '@folio-mind/edit-markdown';
import {
  CheckIcon,
  CloseIcon,
  ExpandableFieldDialog,
  PasteIcon,
  TrashIcon,
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

type IconProps = { className?: string };

function EyeIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      aria-hidden
    >
      <path d="M1.5 8s2.4-4 6.5-4 6.5 4 6.5 4-2.4 4-6.5 4-6.5-4-6.5-4Z" />
      <circle cx="8" cy="8" r="1.7" />
    </svg>
  );
}

function EyeOffIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      aria-hidden
    >
      <path d="M1.5 8s2.4-4 6.5-4 6.5 4 6.5 4-2.4 4-6.5 4-6.5-4-6.5-4Z" />
      <circle cx="8" cy="8" r="1.7" />
      <path d="M2.5 2.5l11 11" />
    </svg>
  );
}

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
  const [pasted, setPasted] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!open) setDraft(value);
  }, [value, open]);
  useEffect(() => {
    if (!pasted) return;
    const timer = setTimeout(() => setPasted(false), 1500);
    return () => clearTimeout(timer);
  }, [pasted]);

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

  async function pasteFromClipboard() {
    if (!navigator.clipboard?.readText) {
      setPasted(false);
      return;
    }
    try {
      const text = await navigator.clipboard.readText();
      if (!text) {
        setPasted(false);
        return;
      }
      if (open) {
        const textarea = textareaRef.current;
        if (textarea) {
          const { selectionStart, selectionEnd } = textarea;
          const { next, caret } = insertTextAtSelection(
            draft,
            selectionStart ?? draft.length,
            selectionEnd ?? draft.length,
            text,
          );
          setDraft(next);
          requestAnimationFrame(() => {
            textarea.setSelectionRange(caret, caret);
          });
        } else {
          setDraft(draft + text);
        }
      } else {
        setDraft(text);
        setOpen(true);
      }
      setPasted(true);
    } catch {
      setPasted(false);
    }
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
          className={`${fieldClassName} min-h-[3.25rem] w-full cursor-pointer rounded-lg border px-3 py-2 text-left outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 disabled:opacity-50 ${hasValue ? 'pr-16' : ''}`}
        >
          {hasValue ? (
            <MarkdownPreview markdown={value} className="text-sm" />
          ) : (
            <span className="whitespace-pre-line text-sm text-slate-400">{placeholder}</span>
          )}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            void pasteFromClipboard();
          }}
          title={pasted ? 'Вставлено' : 'Вставить из буфера'}
          aria-label={`Вставить из буфера: ${label}`}
          className="absolute top-2 right-9 cursor-pointer rounded p-0.5 text-slate-400 hover:bg-white/80 hover:text-folio-700 disabled:opacity-50"
        >
          <PasteIcon className="h-3.5 w-3.5" />
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
                onClick={() => void pasteFromClipboard()}
                title={pasted ? 'Вставлено' : 'Вставить из буфера'}
                aria-label={pasted ? 'Вставлено ✓' : 'Вставить'}
                className="mr-auto cursor-pointer rounded-lg px-2 py-2 text-sm font-medium text-slate-500 hover:bg-folio-50 hover:text-folio-700 md:px-3"
              >
                {pasted ? (
                  <CheckIcon className="h-[18px] w-[18px] text-emerald-600" />
                ) : (
                  <PasteIcon className="h-[18px] w-[18px]" />
                )}
                <span className="ml-1.5 hidden md:inline">
                  {pasted ? 'Вставлено ✓' : 'Вставить'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraft('');
                  onChange('');
                  setOpen(false);
                }}
                title="Очистить"
                aria-label="Очистить"
                className="cursor-pointer rounded-lg px-2 py-2 text-sm font-medium text-slate-500 hover:bg-red-50 hover:text-red-600 md:px-3"
              >
                <TrashIcon className="h-[18px] w-[18px]" />
                <span className="ml-1.5 hidden md:inline">Очистить</span>
              </button>
              <button
                type="button"
                onClick={() => setShowPreview((v) => !v)}
                title={showPreview ? 'Скрыть превью' : 'Показать превью'}
                aria-label={showPreview ? 'Скрыть превью' : 'Показать превью'}
                className="cursor-pointer rounded-lg border border-slate-200 px-2 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 md:px-3"
              >
                {showPreview ? (
                  <EyeOffIcon className="h-[18px] w-[18px]" />
                ) : (
                  <EyeIcon className="h-[18px] w-[18px]" />
                )}
                <span className="ml-1.5 hidden md:inline">
                  {showPreview ? 'Скрыть превью' : 'Показать превью'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                title="Отмена"
                aria-label="Отмена"
                className="cursor-pointer rounded-lg border border-slate-200 px-2 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 md:px-4"
              >
                <CloseIcon className="h-[18px] w-[18px]" />
                <span className="ml-1.5 hidden md:inline">Отмена</span>
              </button>
              <button
                type="button"
                onClick={save}
                title="Сохранить"
                aria-label="Сохранить"
                className="cursor-pointer rounded-lg bg-folio-600 px-2 py-2 text-sm font-medium text-white hover:bg-folio-700 md:px-4"
              >
                <CheckIcon className="h-[18px] w-[18px]" />
                <span className="ml-1.5 hidden md:inline">Сохранить</span>
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
                  ref={textareaRef}
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
