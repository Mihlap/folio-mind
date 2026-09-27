import { getLayoutRulerOffset } from './layout-utils.js';

type Props = {
  pageWidthPx: number;
  pageHeightPx: number;
  stepMm: number;
  pageWidthMm: number;
  pageHeightMm: number;
};

export function PdfLayoutRulers({
  pageWidthPx,
  pageHeightPx,
  stepMm,
  pageWidthMm,
  pageHeightMm,
}: Props) {
  const rulerSize = getLayoutRulerOffset();
  const xTicks = buildTicks(pageWidthMm, stepMm);
  const yTicks = buildTicks(pageHeightMm, stepMm);

  return (
    <>
      <div
        className="pointer-events-none absolute top-0 left-0 z-20 bg-slate-100 text-[9px] text-slate-500"
        style={{ width: rulerSize, height: rulerSize }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute top-0 z-20 border-b border-slate-300 bg-slate-50"
        style={{ left: rulerSize, width: pageWidthPx, height: rulerSize }}
        aria-hidden
      >
        {xTicks.map((mm) => (
          <span
            key={`x-${mm}`}
            className="absolute bottom-0 whitespace-nowrap border-l border-slate-300 pl-0.5"
            style={{ left: `${(mm / pageWidthMm) * 100}%` }}
          >
            {mm % (stepMm * 2) === 0 ? mm : ''}
          </span>
        ))}
      </div>
      <div
        className="pointer-events-none absolute left-0 z-20 border-r border-slate-300 bg-slate-50"
        style={{ top: rulerSize, width: rulerSize, height: pageHeightPx }}
        aria-hidden
      >
        {yTicks.map((mm) => (
          <span
            key={`y-${mm}`}
            className="absolute right-0 whitespace-nowrap border-t border-slate-300 pr-0.5 text-right"
            style={{ top: `${(mm / pageHeightMm) * 100}%` }}
          >
            {mm % (stepMm * 2) === 0 ? mm : ''}
          </span>
        ))}
      </div>
    </>
  );
}

function buildTicks(sizeMm: number, stepMm: number): number[] {
  const ticks: number[] = [];
  for (let mm = 0; mm <= sizeMm; mm += stepMm) ticks.push(mm);
  return ticks;
}
