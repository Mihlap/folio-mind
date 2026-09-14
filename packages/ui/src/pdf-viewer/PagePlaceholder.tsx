type PagePlaceholderProps = {
  pageNumber: number;
  heightPx?: number;
  containerWidth?: number;
};
export function PagePlaceholder({ pageNumber, heightPx, containerWidth = 0 }: PagePlaceholderProps) {
  const height = heightPx && heightPx > 0 ? heightPx : Math.round(containerWidth * 1.414) || 800;
  return (
    <div
      className="flex w-full items-center justify-center rounded bg-white text-sm text-slate-400 shadow-sm"
      style={{ maxWidth: containerWidth || '100%', height }}
    >
      Страница {pageNumber}
    </div>
  );
}
