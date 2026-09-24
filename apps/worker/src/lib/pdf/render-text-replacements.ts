import type { PDFDocument } from 'pdf-lib';
import { rgb } from 'pdf-lib';
import { editPositionKey, type TextItem, type TextMatch } from './find-text-positions.js';
import { calibrateFontSize, fontSizeFromTextItems, pickEmbeddedFontBytes, PdfEditFontCache } from './pdf-edit-fonts.js';
import { splitSuggestionByOriginalLines, explicitTextLines, paragraphDrawMode } from './pdf-text-lines.js';
import { fitReplacementOnPage, fitReplacementAtLayoutLines } from './pdf-fit-replacement-text.js';
import { clampBoxToNeighborLines, textItemBox, unionTextBoxes, type PdfTextBox } from './pdf-text-bounds.js';

type Box = PdfTextBox;

type LineDraw = {
  x: number;
  y: number;
  text: string;
  fontSize: number;
  font: Awaited<ReturnType<PdfEditFontCache['resolve']>>;
};

function unionBoxes(a: Box, b: Box): Box {
  return unionTextBoxes(a, b);
}

function lineEraseRegion(line: TextMatch['lines'][number]): Box {
  if (line.items.length === 0) return line.box;
  let region = textItemBox(line.items[0]!);
  for (const item of line.items.slice(1)) {
    region = unionBoxes(region, textItemBox(item));
  }
  return region;
}

export function eraseBoxesForEdit(match: TextMatch, pageItems: TextItem[]): Box[] {
  const baselines = pageItems.map((item) => item.y);
  const lines = match.lines.length > 0 ? match.lines : [];
  if (lines.length === 0) return match.box.width > 0 && match.box.height > 0 ? [match.box] : [];
  const boxes: Box[] = [];
  for (const line of lines) {
    const region = lineEraseRegion(line);
    const padded: Box = {
      x: Math.max(0, region.x - 0.5),
      y: region.y,
      width: region.width + 1,
      height: region.height,
    };
    const baseline = line.items[0]?.y ?? line.y;
    const clamped = clampBoxToNeighborLines(
      padded,
      baseline,
      baselines,
      Math.max(1, line.style.lineHeight * 0.5),
    );
    if (clamped.width > 0 && clamped.height > 0) boxes.push(clamped);
  }
  return boxes;
}

async function drawExpandedSuggestionLines(
  fontCache: PdfEditFontCache,
  pdfDoc: PDFDocument,
  match: TextMatch,
  layoutLines: TextMatch['lines'],
  suggestion: string,
  pageItems: TextItem[],
  originalText: string,
  fontBytesByName: Map<string, Uint8Array>,
  pageWidth: number,
  pageHeight: number,
): Promise<LineDraw[]> {
  const suggestionLines = explicitTextLines(suggestion);
  if (suggestionLines.length === 0) return [];

  const lastLayout = layoutLines[layoutLines.length - 1] ?? layoutLines[0]!;
  const anchorLine = layoutLines[0]!;
  const draws: LineDraw[] = [];
  let belowY = lastLayout.y;
  let belowLineHeight = lastLayout.style.lineHeight;

  for (let i = 0; i < suggestionLines.length; i++) {
    const layoutLine = layoutLines[i];
    const text = suggestionLines[i]!;
    const line = layoutLine ?? lastLayout;
    const { font, fontSize } = await resolveLayoutLineMetrics(
      fontCache,
      pdfDoc,
      line,
      fontBytesByName,
      text,
    );
    const startY = layoutLine ? layoutLine.y : belowY - belowLineHeight;
    const fitted = fitReplacementOnPage({
      font,
      text,
      baseFontSize: fontSize,
      startX: layoutLine?.x ?? lastLayout.x,
      startY,
      pageWidth,
      pageHeight,
    });
    if (fitted.lines.length === 0) continue;
    for (const fittedLine of fitted.lines) {
      draws.push({
        x: fittedLine.x,
        y: fittedLine.y,
        text: fittedLine.text,
        fontSize: fittedLine.fontSize,
        font,
      });
    }
    belowY = fitted.lines[fitted.lines.length - 1]!.y;
    belowLineHeight = fitted.lineHeight;
  }

  if (draws.length === 0 && anchorLine) {
    return drawFullSuggestionBlock(
      fontCache,
      pdfDoc,
      match,
      layoutLines,
      suggestion,
      pageItems,
      originalText,
      fontBytesByName,
      pageWidth,
      pageHeight,
    );
  }
  return draws;
}

async function resolveLayoutLineMetrics(
  fontCache: PdfEditFontCache,
  pdfDoc: PDFDocument,
  line: TextMatch['lines'][number],
  fontBytesByName: Map<string, Uint8Array>,
  sampleText: string,
): Promise<{ font: Awaited<ReturnType<PdfEditFontCache['resolve']>>; fontSize: number }> {
  const font = await fontCache.resolve(pdfDoc, line.style, fontBytesByName, sampleText);
  if (pickEmbeddedFontBytes(line.style, fontBytesByName)) {
    return { font, fontSize: fontSizeFromTextItems(line.items) };
  }
  const sizes = line.items.map((item) => calibrateFontSize(item, font));
  const fontSize =
    sizes.length > 0
      ? sizes.reduce((sum, size) => sum + size, 0) / sizes.length
      : line.style.fontSize;
  return { font, fontSize };
}

async function drawParagraphAtLayoutLines(
  fontCache: PdfEditFontCache,
  pdfDoc: PDFDocument,
  match: TextMatch,
  layoutLines: TextMatch['lines'],
  suggestion: string,
  pageItems: TextItem[],
  originalText: string,
  fontBytesByName: Map<string, Uint8Array>,
  pageWidth: number,
  pageHeight: number,
): Promise<LineDraw[]> {
  const lineMetrics = await Promise.all(
    layoutLines.map((line) =>
      resolveLayoutLineMetrics(fontCache, pdfDoc, line, fontBytesByName, suggestion.trim()),
    ),
  );
  const wrapMetrics = lineMetrics[0]!;
  const baseFontSize =
    lineMetrics.reduce((sum, metrics) => sum + metrics.fontSize, 0) / lineMetrics.length;
  const fitted = fitReplacementAtLayoutLines({
    font: wrapMetrics.font,
    text: suggestion.trim(),
    baseFontSize,
    layoutLines,
    pageWidth,
    pageHeight,
  });
  if (fitted.lines.length === 0) return [];
  return fitted.lines.map((line, index) => {
    const metrics = lineMetrics[Math.min(index, lineMetrics.length - 1)]!;
    return {
      x: line.x,
      y: line.y,
      text: line.text,
      fontSize: metrics.fontSize,
      font: metrics.font,
    };
  });
}

async function drawFullSuggestionBlock(
  fontCache: PdfEditFontCache,
  pdfDoc: PDFDocument,
  match: TextMatch,
  layoutLines: TextMatch['lines'],
  suggestion: string,
  pageItems: TextItem[],
  originalText: string,
  fontBytesByName: Map<string, Uint8Array>,
  pageWidth: number,
  pageHeight: number,
): Promise<LineDraw[]> {
  if (layoutLines.length > 1) {
    return drawParagraphAtLayoutLines(
      fontCache,
      pdfDoc,
      match,
      layoutLines,
      suggestion,
      pageItems,
      originalText,
      fontBytesByName,
      pageWidth,
      pageHeight,
    );
  }
  const firstLine = layoutLines[0]!;
  const { font, fontSize } = await resolveLayoutLineMetrics(
    fontCache,
    pdfDoc,
    firstLine,
    fontBytesByName,
    suggestion.trim(),
  );
  const fitted = fitReplacementOnPage({
    font,
    text: suggestion.trim(),
    baseFontSize: fontSize,
    startX: firstLine.x,
    startY: firstLine.y,
    pageWidth,
    pageHeight,
  });
  if (fitted.lines.length === 0) return [];
  return fitted.lines.map((line) => ({
    x: line.x,
    y: line.y,
    text: line.text,
    fontSize: line.fontSize,
    font,
  }));
}

async function buildLineDraws(
  fontCache: PdfEditFontCache,
  pdfDoc: PDFDocument,
  match: TextMatch,
  suggestion: string,
  pageItems: TextItem[],
  originalText: string,
  fontBytesByName: Map<string, Uint8Array>,
  pageWidth: number,
  pageHeight: number,
): Promise<LineDraw[]> {
  const layoutLines = match.lines;
  if (layoutLines.length === 0) {
    const text = suggestion.trim();
    if (!text) return [];
    const font = await fontCache.resolve(pdfDoc, match.style, fontBytesByName, text);
    const baseFontSize = pickEmbeddedFontBytes(match.style, fontBytesByName)
      ? fontSizeFromTextItems(
          match.lines.flatMap((line) => line.items).length > 0
            ? match.lines.flatMap((line) => line.items)
            : [],
        )
      : match.style.fontSize;
    const fitted = fitReplacementOnPage({
      font,
      text,
      baseFontSize: baseFontSize || match.style.fontSize,
      startX: match.box.x,
      startY: match.box.y + match.box.height / 1.3,
      pageWidth,
      pageHeight,
    });
    return fitted.lines.map((line) => ({
      x: line.x,
      y: line.y,
      text: line.text,
      fontSize: line.fontSize,
      font,
    }));
  }

  if (layoutLines.length > 1) {
    const mode = paragraphDrawMode(layoutLines.length, suggestion);
    if (mode === 'expanded') {
      return drawExpandedSuggestionLines(
        fontCache,
        pdfDoc,
        match,
        layoutLines,
        suggestion,
        pageItems,
        originalText,
        fontBytesByName,
        pageWidth,
        pageHeight,
      );
    }
    return drawFullSuggestionBlock(
      fontCache,
      pdfDoc,
      match,
      layoutLines,
      suggestion,
      pageItems,
      originalText,
      fontBytesByName,
      pageWidth,
      pageHeight,
    );
  }

  const originalTexts = layoutLines.map((line) => line.originalText);
  const suggestionLines = splitSuggestionByOriginalLines(originalTexts, suggestion);
  const draws: LineDraw[] = [];
  for (let i = 0; i < layoutLines.length; i++) {
    const line = layoutLines[i]!;
    const text = (suggestionLines[i] ?? '').trim();
    if (!text) {
      draws.push({
        x: line.x,
        y: line.y,
        text: '',
        fontSize: line.style.fontSize,
        font: await fontCache.resolve(pdfDoc, line.style, fontBytesByName, ''),
      });
      continue;
    }
    const { font, fontSize } = await resolveLayoutLineMetrics(
      fontCache,
      pdfDoc,
      line,
      fontBytesByName,
      text,
    );
    const fitted = fitReplacementOnPage({
      font,
      text,
      baseFontSize: fontSize,
      startX: line.x,
      startY: line.y,
      pageWidth,
      pageHeight,
    });
    for (const fittedLine of fitted.lines) {
      draws.push({
        x: fittedLine.x,
        y: fittedLine.y,
        text: fittedLine.text,
        fontSize: fittedLine.fontSize,
        font,
      });
    }
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
    anchor?: { xNorm: number; yNorm: number };
  }>,
  itemsByPage: Map<number, TextItem[]> = new Map(),
  fontBytesByName: Map<string, Uint8Array> = new Map(),
): Promise<number> {
  let applied = 0;
  const pending: Array<{ pageIndex: number; draws: LineDraw[] }> = [];
  for (const edit of edits) {
    const pageMap = highlights.get(edit.page);
    const matches = pageMap?.get(editPositionKey(edit));
    if (!matches?.length) continue;
    const pageIndex = edit.page - 1;
    if (pageIndex < 0 || pageIndex >= pdfDoc.getPageCount()) continue;
    const match = matches[0]!;
    const page = pdfDoc.getPage(pageIndex);
    const { width: pageWidth, height: pageHeight } = page.getSize();
    const pageItems = itemsByPage.get(edit.page) ?? [];
    const draws = await buildLineDraws(
      fontCache,
      pdfDoc,
      match,
      edit.suggestion,
      pageItems,
      edit.originalText,
      fontBytesByName,
      pageWidth,
      pageHeight,
    );
    if (draws.length === 0) continue;

    for (const box of eraseBoxesForEdit(match, pageItems)) {
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
