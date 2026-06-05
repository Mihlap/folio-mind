type Props = {
  before: string;
  after: string;
  compact?: boolean;
  className?: string;
};

export function AcceptedEditBeforeAfter({ before, after, compact = false, className = '' }: Props) {
  const textClass = compact ? 'text-[11px] leading-snug' : 'text-xs leading-relaxed';

  return (
    <div
      className={[
        'grid gap-2',
        compact ? 'grid-cols-1 sm:grid-cols-2' : 'sm:grid-cols-2',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="rounded-md border border-red-100 bg-red-50/80 p-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-red-700">Было</p>
        <p className={`mt-1 text-red-900 line-through ${textClass}`}>{before}</p>
      </div>
      <div className="rounded-md border border-emerald-100 bg-emerald-50/80 p-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800">Стало</p>
        <p className={`mt-1 text-emerald-950 ${textClass}`}>{after}</p>
      </div>
    </div>
  );
}
