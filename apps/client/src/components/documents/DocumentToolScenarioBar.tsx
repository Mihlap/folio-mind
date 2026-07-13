import type { ToolScenario, ScenarioStep } from '../../lib/documents/version-workflow.js';
import type { ToolSectionId } from '../ui/ToolAccordionSection.js';

type Props = {
  scenario: ToolScenario;
  onScenarioChange: (scenario: ToolScenario) => void;
  steps: ScenarioStep[];
  onStepClick: (sectionId: ToolSectionId) => void;
};

const SCENARIOS: Array<{ id: ToolScenario; label: string }> = [
  { id: 'booklet', label: 'Буклет' },
  { id: 'contract', label: 'Договор' },
  { id: 'all', label: 'Все' },
];

export function DocumentToolScenarioBar({
  scenario,
  onScenarioChange,
  steps,
  onStepClick,
}: Props) {
  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
      <div className="flex flex-wrap gap-1">
        {SCENARIOS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onScenarioChange(item.id)}
            className={`cursor-pointer rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
              scenario === item.id
                ? 'bg-folio-600 text-white shadow-sm'
                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {steps.length > 0 && (
        <>
          <p className="text-[10px] leading-snug text-slate-500">
            Клик откроет нужный раздел. ✓ — шаг уже выполнен.
          </p>
          <ul className="space-y-1">
            {steps.map((step) => {
              const isRecommended = step.active && !step.done;
              return (
                <li key={step.id}>
                  <button
                    type="button"
                    onClick={() => onStepClick(step.sectionId)}
                    className="flex w-full cursor-pointer items-start gap-2 rounded-md px-1.5 py-1 text-left text-[11px] leading-snug text-slate-600 transition hover:bg-white/80"
                  >
                    <span aria-hidden className="mt-0.5 shrink-0">
                      {step.done ? '✓' : '○'}
                    </span>
                    <span className="min-w-0">
                      <span className={step.done ? 'text-slate-500 line-through' : ''}>
                        {step.label}
                      </span>
                      {isRecommended && (
                        <span className="ml-1.5 text-[10px] font-normal text-slate-400">
                          рекомендуем
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
