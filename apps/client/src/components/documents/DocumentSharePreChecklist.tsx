import type { SharePreCheckItem } from '../../lib/documents/version-workflow.js';

type Props = {
  items: SharePreCheckItem[];
};

export function DocumentSharePreChecklist({ items }: Props) {
  if (items.length === 0) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        Перед созданием ссылки
      </p>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item.id} className="flex items-start gap-2 text-[11px] leading-snug text-slate-700">
            <span
              aria-hidden
              className={`mt-0.5 shrink-0 ${item.done ? 'text-emerald-600' : 'text-slate-400'}`}
            >
              {item.done ? '✓' : '○'}
            </span>
            <span className={item.done ? 'text-slate-500' : ''}>
              {item.label}
              {item.optional && !item.done ? (
                <span className="text-slate-400"> (рекомендуется)</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
