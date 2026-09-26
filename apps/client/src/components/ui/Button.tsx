import type { ButtonHTMLAttributes } from 'react';
type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  radius?: 'md' | 'lg';
};
const variants = {
  primary:
    'bg-folio-600 text-white shadow-md shadow-folio-600/25 hover:bg-folio-700 focus-visible:ring-folio-500',
  secondary:
    'border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 focus-visible:ring-slate-400',
  ghost: 'text-slate-600 hover:bg-slate-100 focus-visible:ring-slate-400',
};
const sizes = {
  sm: 'min-h-9 px-3 text-sm',
  md: 'min-h-12 px-4 text-sm',
  lg: 'min-h-12 px-6 text-base',
};
const radii = {
  md: 'rounded-lg',
  lg: 'rounded-2xl',
};
export function Button({
  variant = 'primary',
  size = 'md',
  radius = 'md',
  className = '',
  children,
  ...props
}: Props) {
  return (
    <button
      type="button"
      className={`inline-flex max-w-full cursor-pointer items-center justify-center font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${radii[radius]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
