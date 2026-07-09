import { useId, useState } from 'react';
import { ExpandableFieldDialog, ExpandableReadOnlyField, EXPANDABLE_DIALOG_TEXTAREA_CLASS } from './ExpandableEditField.js';
import { MarkdownPreview } from './MarkdownPreview.js';

type ContentFormat = 'plain' | 'markdown';

type Props = {
  before: string;
  after: string;
  afterFormat?: ContentFormat;
  compact?: boolean;
  className?: string;
  large?: boolean;
};

function InlineReadOnlyField({
  value,
  className,
  rows,
}: {
  value: string;
  className: string;
  rows: number;
}) {
  return (
    <textarea
      readOnly
      value={value}
      rows={rows}
      className={`w-full resize-y ${className}`}
    />
  );
}

function AfterPreview({
  after,
  afterFormat,
  className,
  rows,
}: {
  after: string;
  afterFormat: ContentFormat;
  className: string;
  rows?: number;
}) {
  if (afterFormat === 'markdown') {
    return (
      <div className={`${className} overflow-auto`}>
        <MarkdownPreview markdown={after} className="text-[11px] leading-snug" />
      </div>
    );
  }
  return (
    <textarea
      readOnly
      value={after}
      rows={rows}
      placeholder="—"
      className={`w-full resize-none ${className}`}
    />
  );
}

function CompactBeforeAfterPreview({
  before,
  after,
  afterFormat,
  textClass,
  previewRows,
}: {
  before: string;
  after: string;
  afterFormat: ContentFormat;
  textClass: string;
  previewRows: number;
}) {
  const beforeClass = `rounded-md border border-red-100 bg-red-50/80 px-2 py-1.5 text-red-900 line-through ${textClass}`;
  const afterClass = `rounded-md border border-emerald-100 bg-emerald-50/80 px-2 py-1.5 text-emerald-950 ${textClass}`;

  return (
    <div className="pointer-events-none grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="space-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-red-700">Было</p>
        <textarea readOnly value={before} rows={previewRows} placeholder="—" className={`w-full resize-none ${beforeClass}`} />
      </div>
      <div className="space-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800">Стало</p>
        <AfterPreview after={after} afterFormat={afterFormat} className={afterClass} rows={previewRows} />
      </div>
    </div>
  );
}

function CompactBeforeAfterCompare({
  before,
  after,
  afterFormat = 'markdown',
  className = '',
}: {
  before: string;
  after: string;
  afterFormat?: ContentFormat;
  className?: string;
}) {
  const dialogId = useId();
  const [open, setOpen] = useState(false);
  const textClass = 'text-[11px] leading-snug';
  const previewRows = 2;
  const beforeClass = `rounded-lg border border-red-100 bg-red-50/80 px-3 py-2 text-red-900 line-through ${textClass}`;
  const afterClass = `rounded-lg border border-emerald-100 bg-emerald-50/80 px-3 py-2 text-emerald-950 ${textClass}`;
  const hasContent = before.trim().length > 0 || after.trim().length > 0;

  function openCompare() {
    if (!hasContent) return;
    setOpen(true);
  }

  return (
    <>
      <div
        role={hasContent ? 'button' : undefined}
        tabIndex={hasContent ? 0 : undefined}
        title={hasContent ? 'Нажмите, чтобы открыть «Было» и «Стало» для сравнения' : undefined}
        aria-label={hasContent ? 'Открыть сравнение «Было» и «Стало»' : undefined}
        onClick={openCompare}
        onKeyDown={(event) => {
          if (!hasContent) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={[
          'rounded-lg border border-slate-200/80 bg-white/70 p-2.5 transition',
          hasContent
            ? 'cursor-pointer hover:border-folio-200 hover:bg-white hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-folio-500'
            : '',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className="pointer-events-none select-none">
          <CompactBeforeAfterPreview
            before={before}
            after={after}
            afterFormat={afterFormat}
            textClass={textClass}
            previewRows={previewRows}
          />
        </div>
      </div>
      <ExpandableFieldDialog
        fieldId={dialogId}
        label="Сравнение: было / стало"
        dialogHint="Полные тексты рядом для сравнения. Можно выделить и скопировать."
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
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex min-h-0 flex-col space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-red-700">Было</p>
            <textarea readOnly value={before} className={`${beforeClass} ${EXPANDABLE_DIALOG_TEXTAREA_CLASS}`} />
          </div>
          <div className="flex min-h-0 flex-col space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800">Стало</p>
            {afterFormat === 'markdown' ? (
              <div className={`${afterClass} min-h-[12rem] overflow-auto`}>
                <MarkdownPreview markdown={after} />
              </div>
            ) : (
              <textarea readOnly value={after} className={`${afterClass} ${EXPANDABLE_DIALOG_TEXTAREA_CLASS}`} />
            )}
          </div>
        </div>
      </ExpandableFieldDialog>
    </>
  );
}

export function AcceptedEditBeforeAfter({
  before,
  after,
  afterFormat = 'markdown',
  compact = false,
  className = '',
  large = false,
}: Props) {
  const textClass = compact ? 'text-[11px] leading-snug' : 'text-sm leading-relaxed';
  const previewRows = large ? 8 : 2;
  const beforeClass = `rounded-lg border border-red-100 bg-red-50/80 px-3 py-2 text-red-900 line-through ${textClass}`;
  const afterClass = `rounded-lg border border-emerald-100 bg-emerald-50/80 px-3 py-2 text-emerald-950 ${textClass}`;

  if (compact && !large) {
    return <CompactBeforeAfterCompare before={before} after={after} afterFormat={afterFormat} className={className} />;
  }

  return (
    <div
      className={[
        'grid gap-3',
        large ? 'grid-cols-1' : 'sm:grid-cols-2',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="space-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-red-700">Было</p>
        {large ? (
          <InlineReadOnlyField value={before} rows={previewRows} className={beforeClass} />
        ) : (
          <ExpandableReadOnlyField
            label="Было (исходный текст)"
            value={before}
            fieldClassName={`rounded-md border border-red-100 bg-red-50/80 px-2 py-1.5 text-red-900 line-through ${textClass}`}
            dialogHint="Полный исходный текст. Можно выделить и скопировать."
          />
        )}
      </div>
      <div className="space-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800">Стало</p>
        {large ? (
          afterFormat === 'markdown' ? (
            <div className={`${afterClass} min-h-[12rem] overflow-auto`}>
              <MarkdownPreview markdown={after} />
            </div>
          ) : (
            <InlineReadOnlyField value={after} rows={previewRows} className={afterClass} />
          )
        ) : afterFormat === 'markdown' ? (
          <div className={`rounded-md border border-emerald-100 bg-emerald-50/80 px-2 py-1.5 ${textClass}`}>
            <MarkdownPreview markdown={after} />
          </div>
        ) : (
          <ExpandableReadOnlyField
            label="Стало (новая формулировка)"
            value={after}
            fieldClassName={`rounded-md border border-emerald-100 bg-emerald-50/80 px-2 py-1.5 text-emerald-950 ${textClass}`}
            dialogHint="Полный предложенный текст. Можно выделить и скопировать."
          />
        )}
      </div>
    </div>
  );
}
