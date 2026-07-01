type Props = {
  count: number;
  onClick: () => void;
};

export function PdfLayoutObjectsHint({ count, onClick }: Props) {
  if (count <= 0) return null;
  const countLabel = String(count);
  const title =
    count === 1
      ? '1 картинка в макете — перейти к странице'
      : count < 5
        ? `${count} картинки в макете — перейти к странице`
        : `${count} картинок в макете — перейти к странице`;
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="pointer-events-auto flex cursor-pointer items-center gap-1.5 rounded-full border border-folio-200/90 bg-white/95 px-2.5 py-1 text-[11px] font-medium text-folio-800 shadow-sm ring-1 ring-white/90 transition hover:border-folio-300 hover:bg-folio-50"
    >
      <span
        className="flex h-4 min-w-4 items-center justify-center rounded-full bg-folio-600 px-1 text-[10px] font-semibold leading-none text-white"
        aria-hidden
      >
        {countLabel}
      </span>
      <span className="leading-none">Макет</span>
    </button>
  );
}
