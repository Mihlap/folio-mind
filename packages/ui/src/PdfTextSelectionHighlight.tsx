export type PdfSelectionHighlightRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type Props = {
  rects: PdfSelectionHighlightRect[];
};

/** Подсветка выделенного текста поверх страницы, пока открыт попап «В правку». */
export function PdfTextSelectionHighlight({ rects }: Props) {
  if (rects.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[3]" aria-hidden>
      {rects.map((r, i) => (
        <div
          key={i}
          className="absolute rounded-sm bg-red-200/25 ring-1 ring-red-200/30"
          style={{
            left: r.left,
            top: r.top,
            width: r.width,
            height: r.height,
          }}
        />
      ))}
    </div>
  );
}
