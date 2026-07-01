import { FeatureHelpButton } from '../ui/FeatureHelp.js';

export type ConfidenceLevel = 'green' | 'yellow' | 'red';

const BADGE: Record<
  ConfidenceLevel,
  {
    label: string;
    className: string;
  }
> = {
  green: {
    label: 'вёрстка OK',
    className: 'bg-emerald-50 text-emerald-800 ring-emerald-200/80',
  },
  yellow: {
    label: 'проверить',
    className: 'bg-amber-50 text-amber-900 ring-amber-200/80',
  },
  red: {
    label: 'риск вёрстки',
    className: 'bg-red-50 text-red-700 ring-red-200/80',
  },
};

type Props = {
  level: ConfidenceLevel | null | undefined;
  summary?: string | null;
  score?: number | null;
  compact?: boolean;
};

export function DocumentVersionConfidenceBadge({
  level,
  summary,
  score,
  compact = false,
}: Props) {
  if (!level) return null;
  const badge = BADGE[level];
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${badge.className}`}
      >
        {badge.label}
        {score != null && !compact && (
          <span className="ml-0.5 text-[9px] opacity-70">({score})</span>
        )}
      </span>
      <FeatureHelpButton title="Качество финальных правок" corner={compact}>
        <p>
          <strong className="text-slate-800">{badge.label}</strong>
          {summary ? ` — ${summary}` : ''}
        </p>
        <p>
          Появляется после «Применить правки», когда PDF пересобран из Word или наложен на страницы.
          Жёлтый уровень — обычная ситуация: текст правок внесён, но число страниц и переносы могут
          отличаться от исходного PDF.
        </p>
      </FeatureHelpButton>
    </span>
  );
}
