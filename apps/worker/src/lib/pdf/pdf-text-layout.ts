import type { PDFDocument, PDFFont, PDFPage, RGB } from 'pdf-lib';
import { rgb } from 'pdf-lib';

export type PdfTextLayout = {
  pdfDoc: PDFDocument;
  page: PDFPage;
  font: PDFFont;
  y: number;
  pageWidth: number;
  pageHeight: number;
  marginX: number;
  marginBottom: number;
  lineHeight: number;
};

export function wrapTextToLines(
  font: PDFFont,
  text: string,
  fontSize: number,
  maxWidth: number,
): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  const words = normalized.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }
  if (current) lines.push(current);

  return lines;
}

function lineCountForText(
  layout: PdfTextLayout,
  text: string,
  fontSize: number,
  indent = 0,
): number {
  const maxWidth = layout.pageWidth - layout.marginX * 2 - indent;
  return wrapTextToLines(layout.font, text, fontSize, maxWidth).length;
}

function ensureLines(layout: PdfTextLayout, linesNeeded: number): void {
  if (layout.y - linesNeeded * layout.lineHeight >= layout.marginBottom) return;

  layout.page = layout.pdfDoc.addPage([layout.pageWidth, layout.pageHeight]);
  layout.y = layout.pageHeight - 40;
}

export function drawTextLine(
  layout: PdfTextLayout,
  text: string,
  options: {
    fontSize: number;
    color?: RGB;
    indent?: number;
    bold?: boolean;
  },
): void {
  const { fontSize, color = rgb(0.15, 0.15, 0.15), indent = 0 } = options;
  ensureLines(layout, 1);
  layout.page.drawText(text, {
    x: layout.marginX + indent,
    y: layout.y,
    size: fontSize,
    font: layout.font,
    color,
  });
  layout.y -= layout.lineHeight;
}

export function drawWrappedParagraph(
  layout: PdfTextLayout,
  text: string,
  options: {
    fontSize: number;
    color?: RGB;
    indent?: number;
    gapAfter?: number;
  },
): void {
  const { fontSize, color = rgb(0.15, 0.15, 0.15), indent = 0, gapAfter = 0 } = options;
  const maxWidth = layout.pageWidth - layout.marginX * 2 - indent;
  const lines = wrapTextToLines(layout.font, text, fontSize, maxWidth);
  if (lines.length === 0) return;

  ensureLines(layout, lines.length);
  for (const line of lines) {
    ensureLines(layout, 1);
    layout.page.drawText(line, {
      x: layout.marginX + indent,
      y: layout.y,
      size: fontSize,
      font: layout.font,
      color,
    });
    layout.y -= layout.lineHeight;
  }
  layout.y -= gapAfter;
}

export function drawLabelAndExcerpt(
  layout: PdfTextLayout,
  label: string,
  excerpt: string,
  options: { fontSize: number; labelColor?: RGB; textColor?: RGB; indent?: number },
): void {
  const { fontSize, labelColor = rgb(0.35, 0.35, 0.35), textColor = rgb(0.2, 0.2, 0.2), indent = 8 } =
    options;
  const labelLine = `${label} `;
  const maxWidth = layout.pageWidth - layout.marginX * 2 - indent;
  const labelWidth = layout.font.widthOfTextAtSize(labelLine, fontSize);
  const firstLineMax = Math.max(40, maxWidth - labelWidth);
  const lines = wrapTextToLines(layout.font, excerpt, fontSize, firstLineMax);

  if (lines.length === 0) {
    drawTextLine(layout, label, { fontSize, color: labelColor, indent });
    return;
  }

  const totalLines = lines.length;
  ensureLines(layout, totalLines);

  layout.page.drawText(`${labelLine}${lines[0]}`, {
    x: layout.marginX + indent,
    y: layout.y,
    size: fontSize,
    font: layout.font,
    color: textColor,
  });
  layout.y -= layout.lineHeight;

  for (const line of lines.slice(1)) {
    ensureLines(layout, 1);
    layout.page.drawText(line, {
      x: layout.marginX + indent + labelWidth,
      y: layout.y,
      size: fontSize,
      font: layout.font,
      color: textColor,
    });
    layout.y -= layout.lineHeight;
  }
}

export function estimateWrappedHeight(
  layout: PdfTextLayout,
  text: string,
  fontSize: number,
  indent = 0,
  gapAfter = 0,
): number {
  const lines = lineCountForText(layout, text, fontSize, indent);
  return lines * layout.lineHeight + gapAfter;
}
