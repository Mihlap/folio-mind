import { ExpandableReadOnlyField } from './ExpandableEditField.js';

type Props = {
  before: string;
  after: string;
  compact?: boolean;
  className?: string;
  /** Крупные поля в модалке: на всю ширину, с ручным изменением высоты */
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

export function AcceptedEditBeforeAfter({
  before,
  after,
  compact = false,
  className = '',
  large = false,
}: Props) {
  const textClass = compact ? 'text-[11px] leading-snug' : 'text-sm leading-relaxed';
  const previewRows = large ? 8 : 2;
  const beforeClass = `rounded-lg border border-red-100 bg-red-50/80 px-3 py-2 text-red-900 line-through ${textClass}`;
  const afterClass = `rounded-lg border border-emerald-100 bg-emerald-50/80 px-3 py-2 text-emerald-950 ${textClass}`;

  return (
    <div
      className={[
        'grid gap-3',
        large ? 'grid-cols-1' : compact ? 'grid-cols-1 sm:grid-cols-2' : 'sm:grid-cols-2',
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
          <InlineReadOnlyField value={after} rows={previewRows} className={afterClass} />
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
