import type { PDFFont } from 'pdf-lib';

export type FittedTextLine = {
  x: number;
  y: number;
  text: string;
  fontSize: number;
};

const PAGE_MARGIN = 36;
const MIN_FONT_SIZE = 6;
const MAX_SHRINK_ITERATIONS = 12;

export function wrapTextToWidth(
  font: PDFFont,
  text: string,
  fontSize: number,
  maxWidth: number,
): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  if (font.widthOfTextAtSize(normalized, fontSize) <= maxWidth) return [normalized];
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

/** Подбирает перенос и размер шрифта, чтобы текст остался на той же странице. */
export function fitReplacementOnPage(params: {
  font: PDFFont;
  text: string;
  baseFontSize: number;
  startX: number;
  startY: number;
  pageWidth: number;
  pageHeight: number;
}): { lines: FittedTextLine[]; lineHeight: number } {
  const { font, text, startX, startY, pageWidth } = params;
  const maxWidth = Math.max(40, pageWidth - startX - PAGE_MARGIN);
  let fontSize = Math.max(MIN_FONT_SIZE, params.baseFontSize);

  for (let attempt = 0; attempt < MAX_SHRINK_ITERATIONS; attempt++) {
    const wrapped = wrapTextToWidth(font, text, fontSize, maxWidth);
    if (wrapped.length === 0) {
      return { lines: [], lineHeight: fontSize * 1.2 };
    }
    const lineHeight = fontSize * 1.2;
    const lines: FittedTextLine[] = wrapped.map((line, index) => ({
      x: startX,
      y: startY - index * lineHeight,
      text: line,
      fontSize,
    }));
    const lowestBaseline = lines[lines.length - 1]!.y;
    if (lowestBaseline - fontSize * 0.25 >= PAGE_MARGIN) {
      return { lines, lineHeight };
    }
    fontSize = Math.max(MIN_FONT_SIZE, fontSize * 0.92);
  }

  const lineHeight = fontSize * 1.2;
  const wrapped = wrapTextToWidth(font, text, fontSize, maxWidth);
  return {
    lines: wrapped.map((line, index) => ({
      x: startX,
      y: startY - index * lineHeight,
      text: line,
      fontSize,
    })),
    lineHeight,
  };
}

export function expandBoxDownward(
  box: { x: number; y: number; width: number; height: number },
  extraLines: number,
  lineHeight: number,
): { x: number; y: number; width: number; height: number } {
  if (extraLines <= 0) return box;
  const extraHeight = extraLines * lineHeight;
  return {
    x: box.x,
    y: box.y - extraHeight,
    width: box.width,
    height: box.height + extraHeight,
  };
}
