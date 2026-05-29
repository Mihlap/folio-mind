import { TrashIcon } from '../ui/icons/TrashIcon.js';

type DeleteDocumentButtonProps = {
  title: string;
  disabled?: boolean;
  onClick: () => void;
  /** Компактная кнопка в списке или крупнее на странице документа */
  variant?: 'list' | 'page';
};

export function DeleteDocumentButton({
  title,
  disabled,
  onClick,
  variant = 'list',
}: DeleteDocumentButtonProps) {
  const isList = variant === 'list';

  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={
        isList
          ? 'flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40'
          : 'flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-red-100 text-red-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40'
      }
    >
      <TrashIcon size={isList ? 17 : 18} />
      <span className="sr-only">{title}</span>
    </button>
  );
}
