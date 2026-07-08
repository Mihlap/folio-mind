import { layoutRectToPx, type LayoutRect } from '@folio-mind/pdf-contracts';

type Props = {
  pageWidthPx: number;
  pageHeightPx: number;
  safe: LayoutRect;
  bleed: LayoutRect;
};

export function PdfLayoutMarginsOverlay({ pageWidthPx, pageHeightPx, safe, bleed }: Props) {
  if (pageWidthPx <= 0 || pageHeightPx <= 0) return null;

  const safePx = layoutRectToPx(safe, pageWidthPx, pageHeightPx);
  const bleedPx = layoutRectToPx(bleed, pageWidthPx, pageHeightPx);

  return (
    <div className="pointer-events-none absolute inset-0 z-[4]" aria-hidden>
      <div
        className="absolute border border-dashed border-rose-300/80"
        style={{
          left: bleedPx.left,
          top: bleedPx.top,
          width: bleedPx.width,
          height: bleedPx.height,
        }}
      />
      <div
        className="absolute border border-dashed border-emerald-500/90 bg-emerald-400/5"
        style={{
          left: safePx.left,
          top: safePx.top,
          width: safePx.width,
          height: safePx.height,
        }}
      />
    </div>
  );
}
