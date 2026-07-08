import { DocumentVersionConfidenceBadge } from './DocumentVersionConfidenceBadge.js';

type Props = {
  level: 'yellow' | 'red';
  summary?: string | null;
  score?: number | null;
  onOpenCompare?: () => void;
};

export function DocumentConfidenceNotice({ level, summary, score, onOpenCompare }: Props) {
  const tone =
    level === 'red'
      ? 'border-red-200 bg-red-50/90 text-red-900'
      : 'border-amber-200 bg-amber-50/90 text-amber-950';
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${tone}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium">
            {level === 'red' ? 'Риск изменения вёрстки' : 'После «Применить правки» — проверьте глазами'}
          </p>
          {summary && <p className="text-[11px] leading-relaxed opacity-90">{summary}</p>}
          <p className="text-[11px] leading-relaxed opacity-80">
            {level === 'yellow'
              ? 'Это напоминание, не сбой. Итоговый PDF уже открыт ниже в полном качестве. Цифра в скобках — оценка системы, насколько безопасно полагаться на автопересборку из Word.'
              : 'Возможны сильные отличия вёрстки. Сверьте таблицы, картинки и переносы страниц в просмотрщике ниже.'}
          </p>
          <DocumentVersionConfidenceBadge level={level} summary={summary} score={score} />
        </div>
        {onOpenCompare && (
          <button
            type="button"
            onClick={onOpenCompare}
            className="shrink-0 cursor-pointer rounded-md border border-current/20 bg-white/70 px-2.5 py-1 text-[11px] font-medium hover:bg-white"
          >
            Сравнение в инструментах
          </button>
        )}
      </div>
    </div>
  );
}
