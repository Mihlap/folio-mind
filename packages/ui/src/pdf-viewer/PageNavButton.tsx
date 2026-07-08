import type { ReactNode } from 'react';
type PageNavButtonProps = {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
};
export function PageNavButton({ label, disabled, onClick, children }: PageNavButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-xl leading-none text-slate-700 transition hover:border-folio-300 hover:bg-folio-50 hover:text-folio-700 disabled:cursor-not-allowed disabled:border-slate-100 disabled:bg-transparent disabled:text-slate-300"
    >
      {children}
    </button>
  );
}
