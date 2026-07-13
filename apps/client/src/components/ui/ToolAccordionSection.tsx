import type { ReactNode } from 'react';
import { FeatureHelpButton } from './FeatureHelp.js';
import type { ToolSectionId } from './ToolAccordionSection.ids.js';

export type { ToolSectionId } from './ToolAccordionSection.ids.js';

type Props = {
  title: string;
  subtitle?: string;
  helpTitle?: string;
  helpContent?: ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  keepMounted?: boolean;
  sectionId?: ToolSectionId;
  sectionRef?: (el: HTMLDivElement | null) => void;
  disabled?: boolean;
  disabledReason?: string;
  children: ReactNode;
};

export function ToolAccordionSection({
  title,
  subtitle,
  helpTitle,
  helpContent,
  isOpen,
  onToggle,
  keepMounted = false,
  sectionId,
  sectionRef,
  disabled = false,
  disabledReason,
  children,
}: Props) {
  return (
    <div
      ref={sectionRef}
      data-tool-section={sectionId}
      className={`overflow-hidden rounded-xl border border-slate-200 bg-white ${
        disabled ? 'opacity-60' : ''
      }`}
    >
      <div className="flex w-full items-start gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={onToggle}
          disabled={disabled}
          title={disabled ? disabledReason : undefined}
          aria-expanded={!disabled && isOpen}
          className="flex min-w-0 flex-1 cursor-pointer items-start gap-2 rounded-lg text-left transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
        >
          <span className="mt-0.5 shrink-0 text-[10px] text-slate-400" aria-hidden>
            {isOpen ? '▼' : '▶'}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-slate-900">{title}</span>
            {subtitle && (
              <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">{subtitle}</span>
            )}
            {disabled && disabledReason && (
              <span className="mt-1 block text-[10px] leading-snug text-amber-700">
                {disabledReason}
              </span>
            )}
          </span>
        </button>
        {helpTitle && helpContent && (
          <FeatureHelpButton title={helpTitle} corner>
            {helpContent}
          </FeatureHelpButton>
        )}
      </div>
      {keepMounted ? (
        <div className={isOpen && !disabled ? 'border-t border-slate-100 px-3 pb-3 pt-2' : 'hidden'}>
          {children}
        </div>
      ) : (
        isOpen &&
        !disabled && <div className="border-t border-slate-100 px-3 pb-3 pt-2">{children}</div>
      )}
    </div>
  );
}
