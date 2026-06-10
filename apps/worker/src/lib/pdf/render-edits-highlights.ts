import type { PDFDocument } from 'pdf-lib';
import { rgb } from 'pdf-lib';
import type { TextBoxPosition } from './find-text-positions.js';

const HIGHLIGHT_COLOR = rgb(1, 0, 0);
const HIGHLIGHT_OPACITY = 0.2;
const PADDING = 0.5;

export function renderHighlightsOnPage(
  pdfDoc: PDFDocument,
  pageIndex: number,
  positions: TextBoxPosition[],
): void {
  const page = pdfDoc.getPage(pageIndex);
  if (!page) return;

  for (const pos of positions) {
    page.drawRectangle({
      x: pos.x - PADDING,
      y: pos.y - PADDING,
      width: pos.width + PADDING * 2,
      height: pos.height + PADDING * 2,
      color: HIGHLIGHT_COLOR,
      opacity: HIGHLIGHT_OPACITY,
    });
  }
}

export function renderAllHighlights(
  pdfDoc: PDFDocument,
  highlights: Map<number, Map<string, TextBoxPosition[]>>,
): void {
  for (const [pageNumber, editMap] of highlights) {
    const pageIndex = pageNumber - 1;
    if (pageIndex < 0 || pageIndex >= pdfDoc.getPageCount()) continue;

    const allPositions: TextBoxPosition[] = [];
    for (const positions of editMap.values()) {
      allPositions.push(...positions);
    }

    if (allPositions.length > 0) {
      renderHighlightsOnPage(pdfDoc, pageIndex, allPositions);
    }
  }
}
