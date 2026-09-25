import type { PDFDocument, PDFFont, PDFPage } from 'pdf-lib';
import { rgb } from 'pdf-lib';
import { editPositionKey, type TextItem, type TextMatch } from './find-text-positions.js';
import {
  buildTextRuns,
  calibrateFontSize,
  fontSizeFromTextItems,
  measureTextRunsWidth,
  pickEmbeddedFontBytes,
  PdfEditFontCache,
  type RunFonts,
} from './pdf-edit-fonts.js';
import { splitSuggestionByOriginalLines, explicitTextLines, paragraphDrawMode } from './pdf-text-lines.js';
import { fitReplacementOnPage, fitReplacementAtLayoutLines } from './pdf-fit-replacement-text.js';
import { expandEraseBox, textItemBox, unionTextBoxes, type PdfTextBox } from './pdf-text-bounds.js';

type Box = PdfTextBox;

type LineDraw = {
  x: number;
  y: number;
  text: string;
  fontSize: number;
  font: Awaited<ReturnType<PdfEditFontCache['resolve']>>;
  runs?: RunFonts;
};

function measuringFont(runs: RunFonts): PDFFont {
  return {
    widthOfTextAtSize: (text: string, size: number) => measureTextRunsWidth(text, runs, size),
  } as unknown as PDFFont;
}

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

function isSubstringMatch(match: TextMatch): boolean {
  const line = match.lines[0];
  if (!line) return false;
  const exact = match.box;
  const lineBox = line.box;
  if (exact.width <= 0 || exact.height <= 0 || lineBox.width <= 0) return false;
  const coversLeft = exact.x - lineBox.x <= 0.5;
  const coversRight = lineBox.x + lineBox.width - (exact.x + exact.width) <= 0.5;
  return !coversLeft || !coversRight;
}

const MM_TO_PT = 72 / 25.4;
const ERASE_PAD_TOP = 2 * MM_TO_PT;
const ERASE_PAD_BOTTOM = 1.5 * MM_TO_PT;

export function eraseBoxesForEdit(match: TextMatch, pageItems: TextItem[]): Box[] {
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
    const clamped = expandEraseBox(
      padded,
      baseline,
      line.style.fontSize,
      pageItems,
      ERASE_PAD_TOP,
      ERASE_PAD_BOTTOM,
    );
    if (clamped.width > 0 && clamped.height > 0) boxes.push(clamped);
  }
  return boxes;
}

export function eraseBoxesForSubstring(match: TextMatch, pageItems: TextItem[]): Box[] {
  const line = match.lines[0];
  if (!line) return [];
  const exact = match.box;
  if (exact.width <= 0 || exact.height <= 0) return [];
  const padded: Box = {
    x: Math.max(0, exact.x - 0.5),
    y: exact.y,
    width: exact.width + 1,
    height: exact.height,
  };
  const baseline = line.items[0]?.y ?? line.y ?? exact.y + exact.height;
  const clamped = expandEraseBox(
    padded,
    baseline,
    line.style.fontSize,
    pageItems,
    ERASE_PAD_TOP,
    ERASE_PAD_BOTTOM,
  );
  return clamped.width > 0 && clamped.height > 0 ? [clamped] : [];
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
    const { font, fontSize, runs } = await resolveLayoutLineMetrics(
      fontCache,
      pdfDoc,
      line,
      fontBytesByName,
      text,
    );
    const startY = layoutLine ? layoutLine.y : belowY - belowLineHeight;
    const fitted = fitReplacementOnPage({
      font: runs ? measuringFont(runs) : font,
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
        runs: runs ?? undefined,
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
): Promise<{
  font: Awaited<ReturnType<PdfEditFontCache['resolve']>>;
  fontSize: number;
  runs: RunFonts | null;
}> {
  const font = await fontCache.resolve(pdfDoc, line.style, fontBytesByName, sampleText);
  const runs = await fontCache.resolveRunFonts(pdfDoc, line.style, fontBytesByName);
  if (runs) {
    return { font, fontSize: fontSizeFromTextItems(line.items), runs };
  }
  const sizes = line.items.map((item) => calibrateFontSize(item, font));
  const fontSize =
    sizes.length > 0
      ? sizes.reduce((sum, size) => sum + size, 0) / sizes.length
      : line.style.fontSize;
  return { font, fontSize, runs: null };
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
  const wrapRuns = wrapMetrics.runs;
  const fitted = fitReplacementAtLayoutLines({
    font: wrapRuns ? measuringFont(wrapRuns) : wrapMetrics.font,
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
      runs: metrics.runs ?? undefined,
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
  const { font, fontSize, runs } = await resolveLayoutLineMetrics(
    fontCache,
    pdfDoc,
    firstLine,
    fontBytesByName,
    suggestion.trim(),
  );
  const fitted = fitReplacementOnPage({
    font: runs ? measuringFont(runs) : font,
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
    runs: runs ?? undefined,
  }));
}

async function drawSubstringReplacement(
  fontCache: PdfEditFontCache,
  pdfDoc: PDFDocument,
  match: TextMatch,
  suggestion: string,
  fontBytesByName: Map<string, Uint8Array>,
  pageWidth: number,
  pageHeight: number,
): Promise<LineDraw[]> {
  const text = suggestion.trim();
  if (!text) return [];
  const line = match.lines[0]!;
  const { font, fontSize, runs } = await resolveLayoutLineMetrics(
    fontCache,
    pdfDoc,
    line,
    fontBytesByName,
    text,
  );
  const fitted = fitReplacementOnPage({
    font: runs ? measuringFont(runs) : font,
    text,
    baseFontSize: fontSize,
    startX: match.box.x,
    startY: line.y,
    pageWidth,
    pageHeight,
  });
  if (fitted.lines.length === 0) return [];
  return fitted.lines.map((fittedLine) => ({
    x: fittedLine.x,
    y: fittedLine.y,
    text: fittedLine.text,
    fontSize: fittedLine.fontSize,
    font,
    runs: runs ?? undefined,
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
  if (isSubstringMatch(match)) {
    return drawSubstringReplacement(
      fontCache,
      pdfDoc,
      match,
      suggestion,
      fontBytesByName,
      pageWidth,
      pageHeight,
    );
  }
  if (layoutLines.length === 0) {
    const text = suggestion.trim();
    if (!text) return [];
    const font = await fontCache.resolve(pdfDoc, match.style, fontBytesByName, text);
    const picked = pickEmbeddedFontBytes(match.style, fontBytesByName);
    const runs = await fontCache.resolveRunFonts(pdfDoc, match.style, fontBytesByName);
    const lineItems = match.lines.flatMap((line) => line.items);
    const baseFontSize = picked
      ? fontSizeFromTextItems(lineItems.length > 0 ? lineItems : [])
      : match.style.fontSize;
    const fitted = fitReplacementOnPage({
      font: runs ? measuringFont(runs) : font,
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
      runs: runs ?? undefined,
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
    const { font, fontSize, runs } = await resolveLayoutLineMetrics(
      fontCache,
      pdfDoc,
      line,
      fontBytesByName,
      text,
    );
    const fitted = fitReplacementOnPage({
      font: runs ? measuringFont(runs) : font,
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
        runs: runs ?? undefined,
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

function drawTextWithFallbackRuns(page: PDFPage, draw: LineDraw): void {
  const options = {
    y: draw.y,
    size: draw.fontSize,
    color: rgb(0, 0, 0),
  } as const;
  if (!draw.runs) {
    page.drawText(draw.text, { ...options, x: draw.x, font: draw.font });
    return;
  }
  let x = draw.x;
  for (const run of buildTextRuns(draw.text, draw.runs)) {
    if (!run.text) continue;
    let width = 0;
    try {
      page.drawText(run.text, { ...options, x, font: run.font });
      width = run.font.widthOfTextAtSize(run.text, draw.fontSize);
    } catch {
      if (run.font !== draw.runs.fallback) {
        try {
          page.drawText(run.text, { ...options, x, font: draw.runs.fallback });
          width = draw.runs.fallback.widthOfTextAtSize(run.text, draw.fontSize);
        } catch {
          width = draw.fontSize * 0.25;
        }
      } else {
        width = draw.fontSize * 0.25;
      }
    }
    x += width;
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

    const eraseBoxes = isSubstringMatch(match)
      ? eraseBoxesForSubstring(match, pageItems)
      : eraseBoxesForEdit(match, pageItems);
    for (const box of eraseBoxes) {
      drawErase(page, box);
    }

    pending.push({ pageIndex, draws });
    applied++;
  }
  for (const item of pending) {
    const page = pdfDoc.getPage(item.pageIndex);
    for (const draw of item.draws) {
      if (!draw.text) continue;
      drawTextWithFallbackRuns(page, draw);
    }
  }
  return applied;
}
