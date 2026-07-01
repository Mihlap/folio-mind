import { useEffect, useId, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
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
export const reportActionBtnBase =
  'inline-flex min-h-8 min-w-0 max-w-full cursor-pointer items-center justify-center rounded-md px-3 py-1.5 text-xs font-medium leading-snug transition-colors disabled:cursor-not-allowed disabled:opacity-50 sm:max-w-[14rem]';
export const reportActionBtnPrimary = `${reportActionBtnBase} bg-folio-600 text-white hover:bg-folio-700`;
export const reportActionBtnSecondary = `${reportActionBtnBase} border border-slate-200 bg-white text-slate-700 hover:border-folio-300 hover:bg-slate-50`;
export const reportActionBtnHighlight = `${reportActionBtnBase} border border-sky-200 bg-sky-50 text-sky-900 hover:bg-sky-100`;
export const reportActionBtnSoft = `${reportActionBtnBase} border border-folio-200 bg-folio-50 text-folio-800 hover:bg-folio-100`;
export const reportIconCircleBase =
  'inline-flex h-8 w-8 max-w-none shrink-0 cursor-pointer items-center justify-center rounded-full border text-[10px] font-bold uppercase leading-none tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-50';
export const reportIconCirclePdf = `${reportIconCircleBase} border-sky-200/90 bg-sky-50 text-sky-800 hover:bg-sky-100`;
export const reportIconCircleWord = `${reportIconCircleBase} border-violet-200/90 bg-violet-50 text-violet-800 hover:bg-violet-100`;
export const reportActionsColumnClass = 'flex w-full min-w-0 flex-col items-stretch gap-1.5';
export const reportToolbarRowClass = 'flex w-full min-w-0 flex-wrap items-center gap-2';
type FeatureHelpActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  helpTitle: string;
  helpContent: ReactNode;
  buttonClassName?: string;
};
export function FeatureHelpActionButton({
  helpTitle,
  helpContent,
  buttonClassName = reportActionBtnPrimary,
  children,
  className,
  ...props
}: FeatureHelpActionButtonProps) {
  return (
    <div className={`flex w-full min-w-0 max-w-full items-center gap-2 ${className ?? ''}`}>
      <button type="button" className={`min-w-0 flex-1 sm:flex-none ${buttonClassName}`} {...props}>
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
