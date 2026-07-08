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

function ExpandableFieldDialog({
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
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${fieldId}-dialog-title`}
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(92vh,720px)] w-full max-w-2xl flex-col rounded-t-2xl border border-slate-200 bg-white shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
          <h3 id={`${fieldId}-dialog-title`} className="text-sm font-semibold text-slate-900">
            {label}
          </h3>
          {dialogHint && <p className="mt-0.5 text-xs text-slate-500">{dialogHint}</p>}
        </div>
        <div className="min-h-0 flex-1 overflow-hidden p-4 sm:p-5">{children}</div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-4 py-3 sm:px-5">
          {footer}
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
        <textarea
          readOnly
          value={value}
          rows={14}
          className={`${fieldClassName} min-h-[40vh] w-full resize-y`}
        />
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
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={placeholder}
            rows={14}
            className={`${fieldClassName} min-h-[40vh] w-full resize-y`}
          />
        </ExpandableFieldDialog>
      )}
    </>
  );
}
