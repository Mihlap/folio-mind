import { useEffect, useId, useState, type MouseEvent, type ReactNode } from 'react';

type EditFieldProps = {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
  fieldClassName: string;
};

type ReadOnlyFieldProps = {
  id?: string;
  label: string;
  value: string;
  fieldClassName: string;
  dialogHint?: string;
};

export const EXPANDABLE_DIALOG_TEXTAREA_CLASS =
  'min-h-[12rem] w-full flex-1 resize-none';

export function ExpandableFieldDialog({
  fieldId,
  label,
  dialogHint,
  open,
  onClose,
  children,
  footer,
}: {
  fieldId: string;
  label: string;
  dialogHint?: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center p-2 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${fieldId}-dialog-title`}
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-slate-900/40"
        aria-label="Закрыть"
        onClick={onClose}
      />
      <div
        className="relative flex max-h-[92vh] min-h-[min(40vh,280px)] w-[min(96vw,42rem)] min-w-[min(96vw,280px)] max-w-[95vw] resize flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-xl sm:rounded-2xl"
        style={{ height: 'min(60vh, 520px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-slate-100 px-4 py-3 sm:px-5">
          <h3 id={`${fieldId}-dialog-title`} className="text-sm font-semibold text-slate-900">
            {label}
          </h3>
          {dialogHint && <p className="mt-0.5 text-xs text-slate-500">{dialogHint}</p>}
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pt-4 pb-2 sm:px-5 sm:pt-5 sm:pb-3">
          {children}
        </div>
        <div className="shrink-0 border-t border-slate-100 px-4 pt-2 pb-1.5 sm:px-5">
          <div className="flex justify-end gap-2">{footer}</div>
          <p className="mt-1 text-right text-[10px] leading-tight text-slate-400" aria-hidden>
            Потяните за угол ↘
          </p>
        </div>
      </div>
    </div>
  );
}

export function ExpandableReadOnlyField({
  id,
  label,
  value,
  fieldClassName,
  dialogHint = 'Нажмите вне окна или «Закрыть», чтобы вернуться к списку.',
}: ReadOnlyFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const [open, setOpen] = useState(false);
  const hasValue = value.trim().length > 0;

  return (
    <>
      <textarea
        id={fieldId}
        value={value}
        readOnly
        onClick={() => hasValue && setOpen(true)}
        onFocus={() => hasValue && setOpen(true)}
        placeholder="—"
        rows={2}
        title={hasValue ? 'Нажмите, чтобы открыть полный текст' : undefined}
        className={`${fieldClassName} w-full cursor-pointer resize-none`}
      />
      <ExpandableFieldDialog
        fieldId={fieldId}
        label={label}
        dialogHint={dialogHint}
        open={open}
        onClose={() => setOpen(false)}
        footer={
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="cursor-pointer rounded-lg bg-folio-600 px-4 py-2 text-sm font-medium text-white hover:bg-folio-700"
          >
            Закрыть
          </button>
        }
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <textarea
            readOnly
            value={value}
            className={`${fieldClassName} ${EXPANDABLE_DIALOG_TEXTAREA_CLASS}`}
          />
        </div>
      </ExpandableFieldDialog>
    </>
  );
}

export function ExpandableEditField({
  id,
  label,
  value,
  onChange,
  placeholder,
  disabled = false,
  fieldClassName,
}: EditFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    if (!open) setDraft(value);
  }, [value, open]);
  function openEditor() {
    if (disabled) return;
    setDraft(value);
    setOpen(true);
  }
  function save() {
    onChange(draft);
    setOpen(false);
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
        <textarea
          id={fieldId}
          value={value}
          readOnly
          onClick={openEditor}
          onFocus={openEditor}
          disabled={disabled}
          placeholder={placeholder}
          rows={2}
          title="Нажмите, чтобы открыть редактор"
          className={`${fieldClassName} cursor-pointer resize-none ${hasValue ? 'pr-9' : ''}`}
        />
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
      </div>

      {open && (
        <ExpandableFieldDialog
          fieldId={fieldId}
          label={label}
          dialogHint="Удобно для длинных фрагментов из PDF. Сохраните — текст попадёт в поле правки."
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
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={placeholder}
              className={`${fieldClassName} ${EXPANDABLE_DIALOG_TEXTAREA_CLASS}`}
            />
          </div>
        </ExpandableFieldDialog>
      )}
    </>
  );
}
