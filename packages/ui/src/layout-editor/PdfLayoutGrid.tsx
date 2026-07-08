type Props = {
  pageWidthPx: number;
  pageHeightPx: number;
  stepMm: number;
  pageWidthMm: number;
  pageHeightMm: number;
};

export function PdfLayoutGrid({
  pageWidthPx,
  pageHeightPx,
  stepMm,
  pageWidthMm,
  pageHeightMm,
}: Props) {
  const stepX = (stepMm / pageWidthMm) * pageWidthPx;
  const stepY = (stepMm / pageHeightMm) * pageHeightPx;
  if (stepX <= 0 || stepY <= 0) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[5]"
      style={{
        backgroundImage: `
          linear-gradient(to right, rgba(148,163,184,0.35) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(148,163,184,0.35) 1px, transparent 1px)
        `,
        backgroundSize: `${stepX}px ${stepY}px`,
      }}
      aria-hidden
    />
  );
}
