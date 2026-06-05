import { FeatureHelpButton } from '../ui/FeatureHelp.js';

export type VersionIntegrityStatus =
  | 'pending'
  | 'intact'
  | 'modified'
  | 'cannot_verify'
  | 'failed'
  | null
  | undefined;

const BADGE: Record<
  Exclude<VersionIntegrityStatus, null | undefined | 'pending'>,
  { label: string; className: string }
> = {
  intact: {
    label: 'структура OK',
    className: 'bg-emerald-50 text-emerald-800 ring-emerald-200/80',
  },
  modified: {
    label: 'есть правки',
    className: 'bg-amber-50 text-amber-900 ring-amber-200/80',
  },
  cannot_verify: {
    label: 'не проверить',
    className: 'bg-slate-100 text-slate-600 ring-slate-200/80',
  },
  failed: {
    label: 'ошибка',
    className: 'bg-red-50 text-red-700 ring-red-200/80',
  },
};

type Props = {
  status: VersionIntegrityStatus;
  summary?: string | null;
  compact?: boolean;
};

export function DocumentVersionIntegrityBadge({ status, summary, compact = false }: Props) {
  if (!status || status === 'pending') {
    if (compact) return null;
    return (
      <span className="inline-flex items-center rounded-full bg-slate-50 px-2 py-0.5 text-[10px] text-slate-400 ring-1 ring-slate-200/80">
        проверка…
      </span>
    );
  }

  const badge = BADGE[status];
  if (!badge) return null;

  return (
    <span className="inline-flex items-center gap-1">
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${badge.className}`}
      >
        {badge.label}
      </span>
      <FeatureHelpButton title="Проверка целостности PDF">
        <p>
          <strong className="text-slate-800">{badge.label}</strong>
          {summary ? ` — ${summary}` : ''}
        </p>
        <p>
          Анализ структуры файла (ревизии сохранения, метаданные Creator/Producer, даты). Это
          эвристика, не криптографическое доказательство: «печать в PDF» и полная пересборка файла
          могут скрыть следы правок.
        </p>
        {status === 'modified' && (
          <p>
            Файл мог быть изменён после первоначального создания — уточните у контрагента или
            сравните с предыдущей версией в системе.
          </p>
        )}
        {status === 'cannot_verify' && (
          <p>
            Типичный экспорт из Word, Google Docs или «Печать в PDF» — структурная проверка не даёт
            надёжного вывода о подлинности.
          </p>
        )}
      </FeatureHelpButton>
    </span>
  );
}
