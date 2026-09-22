import { TrashIcon } from '../ui/icons/TrashIcon.js';
import type { MouseEvent } from 'react';
type DeleteDocumentButtonProps = {
  title: string;
  disabled?: boolean;
  busy?: boolean;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
  variant?: 'list' | 'page';
};
export function DeleteDocumentButton({
  title,
  disabled,
  busy = false,
  onClick,
  variant = 'list',
}: DeleteDocumentButtonProps) {
  const isList = variant === 'list';
  return (
    <button
      type="button"
      title={title}
      disabled={disabled || busy}
      aria-busy={busy}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      className={
        isList
          ? 'flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-red-50/80 text-red-500 transition-colors hover:bg-red-100 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40 md:h-9 md:w-9 md:bg-transparent md:text-slate-400 md:hover:bg-red-50 md:hover:text-red-600'
          : 'flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-red-100 text-red-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40'
      }
    >
      {busy ? (
        <span
          className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden
        />
      ) : (
        <TrashIcon size={isList ? 17 : 18} />
      )}
      <span className="sr-only">{title}</span>
    </button>
  );
}
