import type { ReactNode } from 'react';
import { pdfPointsToMm } from '@folio-mind/pdf-contracts';
import { PdfLayoutRulers } from './PdfLayoutRulers.js';
import { getLayoutRulerOffset } from './layout-utils.js';

export type PdfLayoutPageShellProps = {
  enabled: boolean;
  pageWidthPx: number;
  pageHeightPx: number;
  pageWidthPt: number;
  pageHeightPt: number;
  showRulers: boolean;
  gridStepMm: number;
  children: ReactNode;
};

export function PdfLayoutPageShell({
  enabled,
  pageWidthPx,
  pageHeightPx,
  pageWidthPt,
  pageHeightPt,
  showRulers,
  gridStepMm,
  children,
}: PdfLayoutPageShellProps) {
  if (!enabled || pageWidthPx <= 0 || pageHeightPx <= 0) {
    return <>{children}</>;
  }

  const rulerOffset = showRulers ? getLayoutRulerOffset() : 0;
  const pageWidthMm = pdfPointsToMm(pageWidthPt);
  const pageHeightMm = pdfPointsToMm(pageHeightPt);

  return (
    <div
      className="relative inline-block"
      style={{ marginLeft: rulerOffset, marginTop: rulerOffset }}
    >
      {showRulers && (
        <PdfLayoutRulers
          pageWidthPx={pageWidthPx}
          pageHeightPx={pageHeightPx}
          stepMm={gridStepMm}
          pageWidthMm={pageWidthMm}
          pageHeightMm={pageHeightMm}
        />
      )}
      <div
        className="relative"
        style={showRulers ? { marginLeft: rulerOffset, marginTop: rulerOffset } : undefined}
      >
        {children}
      </div>
    </div>
  );
}
