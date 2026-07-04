import type { ReactNode } from 'react';
import { FeatureHelpButton } from './FeatureHelp.js';

export type ToolSectionId =
  | 'optimize'
  | 'split'
  | 'merge'
  | 'annotations'
  | 'edits'
  | 'diff'
  | 'layout'
  | 'booklet-ai'
  | 'share'
  | 'export';

export const TOOL_SECTION_IDS: ToolSectionId[] = [
  'optimize',
  'split',
  'merge',
  'layout',
  'booklet-ai',
  'export',
  'share',
  'annotations',
  'edits',
  'diff',
];

type Props = {
  title: string;
  subtitle?: string;
  helpTitle?: string;
  helpContent?: ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  keepMounted?: boolean;
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
  children,
}: Props) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex w-full items-start gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          className="flex min-w-0 flex-1 cursor-pointer items-start gap-2 rounded-lg text-left transition hover:bg-slate-50"
        >
          <span className="mt-0.5 shrink-0 text-[10px] text-slate-400" aria-hidden>
            {isOpen ? '▼' : '▶'}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-slate-900">{title}</span>
            {subtitle && (
              <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">{subtitle}</span>
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
        <div className={isOpen ? 'border-t border-slate-100 px-3 pb-3 pt-2' : 'hidden'}>
          {children}
        </div>
      ) : (
        isOpen && <div className="border-t border-slate-100 px-3 pb-3 pt-2">{children}</div>
      )}
    </div>
  );
}
