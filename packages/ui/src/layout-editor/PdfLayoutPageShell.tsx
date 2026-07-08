import type { ReactNode } from 'react';
import { pdfPointsToMm } from '@folio-mind/pdf-contracts';
import { PdfLayoutRulers } from './PdfLayoutRulers.js';
import { getLayoutRulerOffset } from './layout-utils.js';

export type PdfLayoutPageShellProps = {
  enabled: boolean;
  metricsReady: boolean;
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
  metricsReady,
  pageWidthPx,
  pageHeightPx,
  pageWidthPt,
  pageHeightPt,
  showRulers,
  gridStepMm,
  children,
}: PdfLayoutPageShellProps) {
  if (!enabled) {
    return <>{children}</>;
  }

  const rulerOffset = showRulers ? getLayoutRulerOffset() : 0;
  const pageWidthMm = pdfPointsToMm(pageWidthPt);
  const pageHeightMm = pdfPointsToMm(pageHeightPt);
  const rulersReady = metricsReady && pageWidthPx > 0 && pageHeightPx > 0;

  return (
    <div
      className="relative inline-block"
      style={showRulers ? { paddingLeft: rulerOffset, paddingTop: rulerOffset } : undefined}
    >
      {showRulers && rulersReady && (
        <PdfLayoutRulers
          pageWidthPx={pageWidthPx}
          pageHeightPx={pageHeightPx}
          stepMm={gridStepMm}
          pageWidthMm={pageWidthMm}
          pageHeightMm={pageHeightMm}
        />
      )}
      <div className="relative">{children}</div>
    </div>
  );
}
