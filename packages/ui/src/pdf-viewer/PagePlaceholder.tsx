type PagePlaceholderProps = {
  pageNumber: number;
  containerWidth: number;
};
export function PagePlaceholder({ pageNumber, containerWidth }: PagePlaceholderProps) {
  const height = Math.round(containerWidth * 1.414) || 800;
  return (
    <div
      className="flex w-full items-center justify-center rounded bg-white text-sm text-slate-400 shadow-sm"
      style={{ maxWidth: containerWidth || '100%', height }}
    >
      Страница {pageNumber}
    </div>
  );
}
