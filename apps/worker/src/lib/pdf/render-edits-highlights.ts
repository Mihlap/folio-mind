import type { PDFDocument } from 'pdf-lib';
import { rgb } from 'pdf-lib';
import type { TextBoxPosition, TextMatch } from './find-text-positions.js';
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
  highlights: Map<number, Map<string, TextBoxPosition[] | TextMatch[]>>,
): void {
  for (const [pageNumber, editMap] of highlights) {
    const pageIndex = pageNumber - 1;
    if (pageIndex < 0 || pageIndex >= pdfDoc.getPageCount()) continue;
    const allPositions: TextBoxPosition[] = [];
    for (const matches of editMap.values()) {
      for (const entry of matches) {
        if ('lines' in entry && entry.lines.length > 1) {
          for (const line of entry.lines) {
            allPositions.push(line.box);
          }
          continue;
        }
        allPositions.push('box' in entry ? entry.box : entry);
      }
    }
    if (allPositions.length > 0) {
      renderHighlightsOnPage(pdfDoc, pageIndex, allPositions);
    }
  }
}
