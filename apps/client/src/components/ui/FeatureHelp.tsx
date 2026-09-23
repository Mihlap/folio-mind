import { useEffect, useId, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { reportActionBtnPrimary } from './FeatureHelp.styles.js';
type FeatureHelpButtonProps = {
  title: string;
  children: ReactNode;
  corner?: boolean;
};
export function FeatureHelpButton({ title, children, corner = false }: FeatureHelpButtonProps) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);
  return (
    <>
      <button
        type="button"
        aria-label={`Подробнее: ${title}`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className={
          corner
            ? 'flex h-3.5 w-3.5 shrink-0 cursor-pointer items-center justify-center rounded-full border border-slate-200/90 bg-white text-[9px] font-semibold leading-none text-slate-500 shadow-sm hover:border-folio-300 hover:text-folio-600'
            : 'flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full border border-slate-200 bg-white text-[11px] font-semibold leading-none text-slate-500 hover:border-folio-300 hover:text-folio-600'
        }
      >
        i
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          role="presentation"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 id={titleId} className="text-base font-semibold text-slate-900">
                {title}
              </h2>
              <button
                type="button"
                aria-label="Закрыть"
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
            <div className="mt-3 space-y-2 text-sm leading-relaxed text-slate-600">{children}</div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-5 w-full cursor-pointer rounded-lg bg-folio-600 px-4 py-2 text-sm font-medium text-white hover:bg-folio-700"
            >
              Понятно
            </button>
          </div>
        </div>
      )}
    </>
  );
}
type FeatureHelpActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  helpTitle: string;
  helpContent: ReactNode;
  buttonClassName?: string;

  stretch?: boolean;
};
export function FeatureHelpActionButton({
  helpTitle,
  helpContent,
  buttonClassName = reportActionBtnPrimary,
  stretch = false,
  children,
  className,
  ...props
}: FeatureHelpActionButtonProps) {
  return (
    <div
      className={[
        'flex min-w-0 max-w-full flex-nowrap items-center gap-1.5',
        stretch ? 'w-full' : 'w-full',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <button
        type="button"
        className={[
          stretch ? 'min-w-0 flex-1' : 'min-w-0 flex-1 sm:flex-none',
          buttonClassName,
        ].join(' ')}
        {...props}
      >
        {children}
      </button>
      <FeatureHelpButton title={helpTitle} corner>
        {helpContent}
      </FeatureHelpButton>
    </div>
  );
}
type PanelSectionHeaderProps = {
  title: string;
  description?: string;
  helpTitle?: string;
  helpContent?: ReactNode;
};
export function PanelSectionHeader({
  title,
  description,
  helpTitle,
  helpContent,
}: PanelSectionHeaderProps) {
  return (
    <div>
      <div className="flex items-center gap-1">
        <h3 className="text-xs font-medium text-slate-800">{title}</h3>
        {helpTitle && helpContent && (
          <FeatureHelpButton title={helpTitle}>{helpContent}</FeatureHelpButton>
        )}
      </div>
      {description && <p className="mt-1 text-[11px] text-slate-500">{description}</p>}
    </div>
  );
}
