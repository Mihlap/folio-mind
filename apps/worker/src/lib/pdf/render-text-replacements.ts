import type { PDFDocument } from 'pdf-lib';
import { rgb } from 'pdf-lib';
import { expandEraseRegion, type TextItem, type TextMatch } from './find-text-positions.js';
import { calibrateFontSize, PdfEditFontCache } from './pdf-edit-fonts.js';
import { splitSuggestionByOriginalLines } from './pdf-text-lines.js';

const HORIZONTAL_PAD = 8;
const VERTICAL_PAD = 4;

type Box = { x: number; y: number; width: number; height: number };

type LineDraw = {
  x: number;
  y: number;
  text: string;
  fontSize: number;
  font: Awaited<ReturnType<PdfEditFontCache['resolve']>>;
  eraseBox: Box;
};

function textItemBox(item: TextItem): Box {
  const h = item.height || item.fontSize || 10;
  return {
    x: item.x,
    y: item.y - h * 0.15,
    width: item.width,
    height: h * 1.3,
  };
}

function unionBoxes(a: Box, b: Box): Box {
  const x1 = Math.min(a.x, b.x);
  const y1 = Math.min(a.y, b.y);
  const x2 = Math.max(a.x + a.width, b.x + b.width);
  const y2 = Math.max(a.y + a.height, b.y + b.height);
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

function boxesOverlap(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function padBox(box: Box): Box {
  return {
    x: Math.max(0, box.x - HORIZONTAL_PAD),
    y: box.y - VERTICAL_PAD,
    width: box.width + HORIZONTAL_PAD * 2,
    height: box.height + VERTICAL_PAD * 2,
  };
}

function computeEraseBox(
  line: TextMatch['lines'][number],
  pageItems: TextItem[],
  originalText: string,
  suggestion: string,
): Box {
  let region = expandEraseRegion(pageItems, line.box, originalText, suggestion);
  region = unionBoxes(region, line.box);
  for (const item of line.items) {
    region = unionBoxes(region, textItemBox(item));
  }
  const padded = padBox(region);
  for (const item of pageItems) {
    const itemBox = textItemBox(item);
    if (boxesOverlap(padded, itemBox)) {
      region = unionBoxes(region, itemBox);
    }
  }
  return padBox(region);
}

function eraseMatchRegion(pageItems: TextItem[], match: TextMatch, originalText: string, suggestion: string): Box {
  let region = expandEraseRegion(pageItems, match.box, originalText, suggestion);
  for (const line of match.lines) {
    region = unionBoxes(region, line.box);
    for (const item of line.items) {
      region = unionBoxes(region, textItemBox(item));
    }
  }
  const padded = padBox(region);
  for (const item of pageItems) {
    const itemBox = textItemBox(item);
    if (boxesOverlap(padded, itemBox)) {
      region = unionBoxes(region, itemBox);
    }
  }
  return padBox(region);
}

async function buildLineDraws(
  fontCache: PdfEditFontCache,
  pdfDoc: PDFDocument,
  match: TextMatch,
  suggestion: string,
  pageItems: TextItem[],
  originalText: string,
  fontBytesByName: Map<string, Uint8Array>,
): Promise<LineDraw[]> {
  const layoutLines = match.lines;
  if (layoutLines.length === 0) {
    const font = await fontCache.resolve(pdfDoc, match.style, fontBytesByName);
    const text = suggestion.trim();
    if (!text) return [];
    const fontSize = match.style.fontSize;
    return [
      {
        x: match.box.x,
        y: match.box.y + match.box.height / 1.3,
        text,
        fontSize,
        font,
        eraseBox: eraseMatchRegion(pageItems, match, originalText, suggestion),
      },
    ];
  }

  const originalTexts = layoutLines.map((line) => line.originalText);
  const suggestionLines = splitSuggestionByOriginalLines(originalTexts, suggestion);
  const draws: LineDraw[] = [];
  for (let i = 0; i < layoutLines.length; i++) {
    const line = layoutLines[i]!;
    const text = (suggestionLines[i] ?? '').trim();
    const eraseBox = computeEraseBox(line, pageItems, originalText, suggestion);
    if (!text) {
      draws.push({
        x: line.x,
        y: line.y,
        text: '',
        fontSize: line.style.fontSize,
        font: await fontCache.resolve(pdfDoc, line.style, fontBytesByName),
        eraseBox,
      });
      continue;
    }
    const font = await fontCache.resolve(pdfDoc, line.style, fontBytesByName);
    const sizes = line.items.map((item) => calibrateFontSize(item, font));
    const fontSize =
      sizes.length > 0
        ? sizes.reduce((sum, size) => sum + size, 0) / sizes.length
        : line.style.fontSize;
    draws.push({
      x: line.x,
      y: line.y,
      text,
      fontSize,
      font,
      eraseBox,
    });
  }
  return draws;
}

function drawErase(page: ReturnType<PDFDocument['getPage']>, box: Box): void {
  for (let layer = 0; layer < 3; layer++) {
    page.drawRectangle({
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      color: rgb(1, 1, 1),
      borderWidth: 0,
      opacity: 1,
    });
  }
}

export async function renderTextReplacements(
  pdfDoc: PDFDocument,
  fontCache: PdfEditFontCache,
  highlights: Map<number, Map<string, TextMatch[]>>,
  edits: Array<{
    page: number;
    originalText: string;
    suggestion: string;
  }>,
  itemsByPage: Map<number, TextItem[]> = new Map(),
  fontBytesByName: Map<string, Uint8Array> = new Map(),
): Promise<number> {
  let applied = 0;
  const pending: Array<{ pageIndex: number; draws: LineDraw[] }> = [];
  for (const edit of edits) {
    const pageMap = highlights.get(edit.page);
    const matches = pageMap?.get(edit.originalText);
    if (!matches?.length) continue;
    const pageIndex = edit.page - 1;
    if (pageIndex < 0 || pageIndex >= pdfDoc.getPageCount()) continue;
    const match = matches[0]!;
    const pageItems = itemsByPage.get(edit.page) ?? [];
    const draws = await buildLineDraws(
      fontCache,
      pdfDoc,
      match,
      edit.suggestion,
      pageItems,
      edit.originalText,
      fontBytesByName,
    );
    if (draws.length === 0) continue;

    const page = pdfDoc.getPage(pageIndex);
    const eraseBoxes = new Map<string, Box>();
    const matchErase = eraseMatchRegion(pageItems, match, edit.originalText, edit.suggestion);
    eraseBoxes.set(
      `${matchErase.x}:${matchErase.y}:${matchErase.width}:${matchErase.height}`,
      matchErase,
    );
    for (const draw of draws) {
      const key = `${draw.eraseBox.x}:${draw.eraseBox.y}:${draw.eraseBox.width}:${draw.eraseBox.height}`;
      eraseBoxes.set(key, draw.eraseBox);
    }
    for (const box of eraseBoxes.values()) {
      drawErase(page, box);
    }

    pending.push({ pageIndex, draws });
    applied++;
  }
  for (const item of pending) {
    const page = pdfDoc.getPage(item.pageIndex);
    for (const draw of item.draws) {
      if (!draw.text) continue;
      page.drawText(draw.text, {
        x: draw.x,
        y: draw.y,
        size: draw.fontSize,
        font: draw.font,
        color: rgb(0, 0, 0),
      });
    }
  }
  return applied;
}
