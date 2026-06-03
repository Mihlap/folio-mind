type Props = {
  edge: 'left' | 'right';
  onMouseDown: (event: React.MouseEvent) => void;
  className?: string;
};

export function PanelResizeHandle({ edge, onMouseDown, className }: Props) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Изменить ширину панели"
      title="Потяните, чтобы изменить ширину"
      onMouseDown={onMouseDown}
      className={[
        'absolute top-0 z-10 hidden h-full w-1.5 shrink-0 cursor-col-resize transition-colors hover:bg-folio-300/80 md:block',
        edge === 'left' ? 'left-0 -translate-x-1/2' : 'right-0 translate-x-1/2',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    />
  );
}
