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

function wrapTextPreservingLineBreaks(
  font: PDFFont,
  text: string,
  fontSize: number,
  maxWidth: number,
): string[] {
  const segments = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (segments.length === 0) return [];
  const lines: string[] = [];
  for (const segment of segments) {
    lines.push(...wrapTextToWidth(font, segment, fontSize, maxWidth));
  }
  return lines;
}

export function layoutLineSpacings(layoutLines: Array<{ y: number }>): number[] {
  const spacings: number[] = [];
  for (let i = 0; i < layoutLines.length - 1; i++) {
    const gap = layoutLines[i]!.y - layoutLines[i + 1]!.y;
    if (gap > 0) spacings.push(gap);
  }
  return spacings;
}

export function averageLineSpacing(spacings: number[], fallback: number): number {
  if (spacings.length === 0) return fallback;
  return spacings.reduce((sum, gap) => sum + gap, 0) / spacings.length;
}

export function yForWrappedLineIndex(
  index: number,
  layoutLines: Array<{ y: number }>,
  defaultSpacing: number,
): number {
  if (index < layoutLines.length) return layoutLines[index]!.y;
  const last = layoutLines[layoutLines.length - 1]!;
  return last.y - (index - layoutLines.length + 1) * defaultSpacing;
}

function placeWrappedAtLayout(
  font: PDFFont,
  wrapped: string[],
  fontSize: number,
  layoutLines: Array<{ x: number; y: number }>,
  lineHeight: number,
): FittedTextLine[] {
  return wrapped.map((line, index) => ({
    x: layoutLines[Math.min(index, layoutLines.length - 1)]!.x,
    y: yForWrappedLineIndex(index, layoutLines, lineHeight),
    text: line,
    fontSize,
  }));
}

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
    const wrapped = wrapTextPreservingLineBreaks(font, text, fontSize, maxWidth);
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
  const wrapped = wrapTextPreservingLineBreaks(font, text, fontSize, maxWidth);
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

export function fitReplacementAtLayoutLines(params: {
  font: PDFFont;
  text: string;
  baseFontSize: number;
  layoutLines: Array<{ x: number; y: number }>;
  pageWidth: number;
  pageHeight: number;
}): { lines: FittedTextLine[]; lineHeight: number } {
  const { font, text, layoutLines, pageWidth } = params;
  if (layoutLines.length === 0) {
    return { lines: [], lineHeight: params.baseFontSize * 1.2 };
  }
  const startX = layoutLines[0]!.x;
  const maxWidth = Math.max(40, pageWidth - startX - PAGE_MARGIN);
  const spacings = layoutLineSpacings(layoutLines);
  const fallbackSpacing = Math.max(params.baseFontSize * 1.15, 6);
  let fontSize = Math.max(MIN_FONT_SIZE, params.baseFontSize);

  for (let attempt = 0; attempt < MAX_SHRINK_ITERATIONS; attempt++) {
    const wrapped = wrapTextPreservingLineBreaks(font, text, fontSize, maxWidth);
    if (wrapped.length === 0) {
      return { lines: [], lineHeight: averageLineSpacing(spacings, fallbackSpacing) };
    }
    const lineHeight = averageLineSpacing(spacings, fontSize * 1.15);
    const lines = placeWrappedAtLayout(font, wrapped, fontSize, layoutLines, lineHeight);
    const lowestBaseline = lines[lines.length - 1]!.y;
    if (lowestBaseline - fontSize * 0.25 >= PAGE_MARGIN) {
      return { lines, lineHeight };
    }
    fontSize = Math.max(MIN_FONT_SIZE, fontSize * 0.92);
  }

  const lineHeight = averageLineSpacing(spacings, fontSize * 1.15);
  const wrapped = wrapTextPreservingLineBreaks(font, text, fontSize, maxWidth);
  return {
    lines: placeWrappedAtLayout(font, wrapped, fontSize, layoutLines, lineHeight),
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
