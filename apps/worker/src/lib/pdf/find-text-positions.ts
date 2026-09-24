import { getDocument, GlobalWorkerOptions, VerbosityLevel } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { buildPageLayoutSignature, type PageLayoutSignature } from '@folio-mind/pdf-contracts';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { collectEmbeddedFontBytes, type PdfTextStyle } from './pdf-edit-fonts.js';
import { textItemBox, textSubstringBox } from './pdf-text-bounds.js';
import { buildMatchedLines, type MatchedLine } from './pdf-text-lines.js';
const require = createRequire(import.meta.url);
const pdfjsPkgDir = dirname(require.resolve('pdfjs-dist/package.json'));
GlobalWorkerOptions.workerSrc = pathToFileURL(
  join(pdfjsPkgDir, 'legacy/build/pdf.worker.mjs'),
).href;
const standardFontDataUrl = `${pathToFileURL(join(pdfjsPkgDir, 'standard_fonts')).href}/`;
export type TextBoxPosition = {
  x: number;
  y: number;
  width: number;
  height: number;
};
export type TextItem = {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontName: string;
  fontFamily: string;
  ascent?: number;
  descent?: number;
  fontAscent?: number;
  fontDescent?: number;
  fontWidth?: number;
  fontBoundingBoxAscent?: number;
  fontBoundingBoxDescent?: number;
  fontSubstitution?: string;
  fontVariationSettings?: string;
  hasEOL: boolean;
};
export type TextMatch = {
  box: TextBoxPosition;
  style: PdfTextStyle;
  lines: MatchedLine[];
};
function norm(str: string): string {
  return str
    .replace(/\u00A0/g, ' ')
    .replace(/\u00AD/g, '')
    .replace(/\uF0B7/g, '•')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}
function stripListMarkerForSearch(line: string): string {
  return line
    .trim()
    .replace(/^&bullet;\s*/i, '')
    .replace(/^[-*+•●\uF0B7\u2022]\s*/, '')
    .trim();
}
function looksLikeListQuote(searchText: string): boolean {
  return searchText
    .split(/\n+/)
    .some((line) => /^\s*([-*+•●\uF0B7]|\d+[.)]|&bullet;)/i.test(line.trim()));
}
function shouldSearchLineByLine(searchText: string): boolean {
  const lines = searchText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length < 2) return false;
  if (looksLikeListQuote(searchText)) return true;

  const bodies = lines.map((line) => stripListMarkerForSearch(line));
  const maxLen = Math.max(...bodies.map((line) => line.length));
  const avgLen = bodies.reduce((sum, line) => sum + line.length, 0) / bodies.length;

  if (maxLen > 60) {
    const first = bodies[0] ?? '';
    const second = bodies[1] ?? '';
    if (/[,;:]\s*$/.test(first) && /^[а-яa-zё]/i.test(second)) return false;
    if (avgLen > 45) return false;
  }

  return maxLen <= 55;
}
function searchListLinesInItems(
  items: TextItem[],
  searchText: string,
  anchor?: { xNorm: number; yNorm: number },
  pageSize?: { width: number; height: number },
): TextBoxPosition[] {
  const rawLines = searchText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (rawLines.length < 2) return [];

  const sorted = sortItemsReadingOrder(items);
  const boxes: TextBoxPosition[] = [];
  let nearX: number | undefined;
  let belowY: number | undefined;

  for (const rawLine of rawLines) {
    const needle = norm(stripListMarkerForSearch(rawLine));
    if (needle.length < 2) continue;

    let candidates = searchSingleItems(sorted, needle);
    if (candidates.length === 0) {
      const span = findSpanInReadingOrder(sorted, rawLine);
      if (!span) return [];
      candidates = [span];
    }

    if (nearX != null) {
      const columnX = nearX;
      const inColumn = candidates.filter((box) => Math.abs(box.x - columnX) < 100);
      if (inColumn.length > 0) candidates = inColumn;
    }
    if (belowY != null) {
      const lower = candidates.filter((box) => box.y < belowY! - 1);
      if (lower.length > 0) candidates = lower;
    }

    const box =
      boxes.length === 0 && anchor && pageSize
        ? pickBestTextBoxNearAnchor(candidates, anchor, pageSize)
        : candidates.length === 1
          ? candidates[0]!
          : pickBestTextBox(candidates);

    boxes.push(box);
    nearX = box.x;
    belowY = box.y;
  }

  return boxes.length >= 2 ? boxes : [];
}
function sortItemsReadingOrder(items: TextItem[]): TextItem[] {
  return [...items].sort((a, b) => {
    const lineThreshold = Math.min(a.height || a.fontSize, b.height || b.fontSize, 12) * 0.55;
    const yDiff = b.y - a.y;
    if (Math.abs(yDiff) > lineThreshold) return yDiff;
    return a.x - b.x;
  });
}
function needsSpaceBetweenItems(prev: TextItem, next: TextItem): boolean {
  const lineH = Math.max(prev.height || prev.fontSize, next.height || next.fontSize, 8) * 0.45;
  return Math.abs(next.y - prev.y) > lineH;
}
function buildReadingPlain(sorted: TextItem[]): {
  plain: string;
  segments: Array<{ item: TextItem; plainStart: number; plainEnd: number }>;
} {
  let plain = '';
  const segments: Array<{ item: TextItem; plainStart: number; plainEnd: number }> = [];
  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i]!;
    if (i > 0 && needsSpaceBetweenItems(sorted[i - 1]!, item)) {
      plain += ' ';
    }
    const plainStart = plain.length;
    plain += item.str;
    segments.push({ item, plainStart, plainEnd: plain.length });
  }
  return { plain, segments };
}
function findPlainSpanForNeedle(
  plain: string,
  searchText: string,
): { start: number; end: number } | null {
  const target = norm(searchText);
  if (!target) return null;
  const variants = [target];
  if (searchText.includes('\n')) {
    variants.push(norm(searchText.replace(/\n+/g, ' ')));
  }
  const maxLen = Math.min(plain.length, target.length * 3 + 96);
  for (const variant of variants) {
    for (let start = 0; start < plain.length; start++) {
      for (let end = start + 1; end <= Math.min(plain.length, start + maxLen); end++) {
        if (norm(plain.slice(start, end)) === variant) {
          return { start, end };
        }
      }
    }
  }
  return null;
}
function findSpanInReadingOrder(items: TextItem[], searchText: string): TextBoxPosition | null {
  const sorted = sortItemsReadingOrder(items);
  const { plain, segments } = buildReadingPlain(sorted);
  const span = findPlainSpanForNeedle(plain, searchText);
  if (!span) return null;
  const spanItems = segments
    .filter((segment) => segment.plainEnd > span.start && segment.plainStart < span.end)
    .map((segment) => segment.item);
  if (spanItems.length === 0) return null;
  return unionManyBoxes(spanItems.map(itemBox));
}
function fontSizeFromTransform(transform: number[]): number {
  if (transform.length < 2) return 0;
  return Math.hypot(transform[0] ?? 0, transform[1] ?? 0);
}
function itemBox(item: TextItem): TextBoxPosition {
  const box = textItemBox(item);
  return { x: box.x, y: box.y, width: box.width, height: box.height };
}
function unionBoxes(a: TextBoxPosition, b: TextBoxPosition): TextBoxPosition {
  const x1 = Math.min(a.x, b.x);
  const y1 = Math.min(a.y, b.y);
  const x2 = Math.max(a.x + a.width, b.x + b.width);
  const y2 = Math.max(a.y + a.height, b.y + b.height);
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}
function unionManyBoxes(boxes: TextBoxPosition[]): TextBoxPosition {
  if (boxes.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let result = boxes[0]!;
  for (let i = 1; i < boxes.length; i++) {
    result = unionBoxes(result, boxes[i]!);
  }
  return result;
}
function boxesOverlap(a: TextBoxPosition, b: TextBoxPosition): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
function styleFromItems(items: TextItem[]): PdfTextStyle {
  if (items.length === 0) {
    return { fontSize: 12, fontName: '', fontFamily: 'sans-serif', lineHeight: 14 };
  }
  const primary = items.reduce((best, item) =>
    item.str.length > best.str.length ? item : best,
  );
  const fontSize = Math.max(6, Math.min(primary.fontSize || primary.height || 12, 72));
  const lineHeight = Math.max(fontSize, primary.height || fontSize) * 1.2;
  return {
    fontSize,
    fontName: primary.fontName,
    fontFamily: primary.fontFamily,
    lineHeight,
    ...(primary.fontSubstitution ? { fontSubstitution: primary.fontSubstitution } : {}),
    ...(primary.fontVariationSettings
      ? { fontVariationSettings: primary.fontVariationSettings }
      : {}),
    ...(primary.ascent != null ? { ascent: primary.ascent } : {}),
    ...(primary.descent != null ? { descent: primary.descent } : {}),
    ...(primary.fontWidth != null ? { fontWidth: primary.fontWidth } : {}),
    ...(primary.fontBoundingBoxAscent != null
      ? { fontBoundingBoxAscent: primary.fontBoundingBoxAscent }
      : {}),
    ...(primary.fontBoundingBoxDescent != null
      ? { fontBoundingBoxDescent: primary.fontBoundingBoxDescent }
      : {}),
  };
}
function resolveMatchStyle(items: TextItem[], box: TextBoxPosition): PdfTextStyle {
  const overlapping = items.filter((item) => boxesOverlap(itemBox(item), box));
  if (overlapping.length > 0) return styleFromItems(overlapping);
  let best: TextItem | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  for (const item of items) {
    const dx = item.x - cx;
    const dy = item.y - cy;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      best = item;
    }
  }
  return styleFromItems(best ? [best] : []);
}
function getMatchedItems(items: TextItem[], box: TextBoxPosition): TextItem[] {
  const overlapping = items.filter((item) => boxesOverlap(itemBox(item), box));
  if (overlapping.length > 0) return overlapping;
  return items.filter((item) => {
    const b = itemBox(item);
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    return cx >= box.x && cx <= box.x + box.width && cy >= box.y && cy <= box.y + box.height;
  });
}
function toHighlightMatch(
  items: TextItem[],
  boxes: TextBoxPosition[],
  searchText: string,
): TextMatch {
  const lines = boxes.map((box) => {
    const matched = getMatchedItems(items, box);
    const style = resolveMatchStyle(items, box);
    return {
      x: box.x,
      y: matched[0]?.y ?? box.y + box.height,
      width: box.width,
      box,
      style,
      originalText: searchText,
      items: matched,
    };
  });
  return {
    box: unionManyBoxes(boxes),
    style: lines[0]!.style,
    lines,
  };
}
function toMatchFromLineBoxes(
  items: TextItem[],
  boxes: TextBoxPosition[],
  searchText: string,
  _suggestion: string,
): TextMatch {
  const quoteLines = searchText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const lines = boxes.map((box, index) => {
    const matched = getMatchedItems(items, box);
    const style = resolveMatchStyle(items, box);
    return {
      x: box.x,
      y: matched[0]?.y ?? box.y + box.height,
      width: box.width,
      box,
      style,
      originalText: quoteLines[index] ?? searchText,
      items: matched,
    };
  });
  return {
    box: unionManyBoxes(boxes),
    style: lines[0]!.style,
    lines,
  };
}
function toMatch(
  items: TextItem[],
  box: TextBoxPosition,
  searchText: string,
  suggestion: string,
): TextMatch {
  const matched = getMatchedItems(items, box);
  let lines = buildMatchedLines(items, matched, searchText, suggestion);
  if (lines.length === 0) {
    const style = resolveMatchStyle(items, box);
    lines = [
      {
        x: box.x,
        y: matched[0]?.y ?? box.y + box.height,
        width: box.width,
        box,
        style,
        originalText: searchText,
        items: matched,
      },
    ];
  }
  const fullBox = lines.length > 0 ? unionManyBoxes(lines.map((line) => line.box)) : box;
  return {
    box: fullBox,
    style: lines[0]?.style ?? resolveMatchStyle(items, box),
    lines,
  };
}
type PdfTextStyleRecord = {
  fontFamily?: string;
  ascent?: number;
  descent?: number;
  fontSubstitution?: string;
  fontVariationSettings?: string;
  fontBoundingBoxAscent?: number;
  fontBoundingBoxDescent?: number;
  fontAscent?: number;
  fontDescent?: number;
  fontWidth?: number;
};

async function collectPageTextItems(page: {
  getTextContent: () => Promise<{
    items: Array<Record<string, unknown>>;
    styles: Record<string, PdfTextStyleRecord>;
  }>;
}): Promise<TextItem[]> {
  const content = await page.getTextContent();
  const items: TextItem[] = [];
  for (const raw of content.items) {
    if (typeof raw.str !== 'string' || !raw.str) continue;
    const transform = Array.isArray(raw.transform) ? (raw.transform as number[]) : [];
    const fontName = typeof raw.fontName === 'string' ? raw.fontName : '';
    const style = fontName ? content.styles[fontName] : undefined;
    const fontFamily = style?.fontFamily ?? 'sans-serif';
    const fontSize = fontSizeFromTransform(transform);
    const height = typeof raw.height === 'number' ? raw.height : fontSize;
    const width = typeof raw.width === 'number' ? raw.width : 0;
    items.push({
      str: raw.str,
      x: transform[4] ?? 0,
      y: transform[5] ?? 0,
      width,
      height: height > 0 ? height : fontSize,
      fontSize: fontSize > 0 ? fontSize : height > 0 ? height : 12,
      fontName,
      fontFamily,
      ...(style?.ascent != null ? { ascent: style.ascent } : {}),
      ...(style?.descent != null ? { descent: style.descent } : {}),
      ...(style?.fontSubstitution ? { fontSubstitution: style.fontSubstitution } : {}),
      ...(style?.fontVariationSettings
        ? { fontVariationSettings: style.fontVariationSettings }
        : {}),
      ...(style?.fontBoundingBoxAscent != null
        ? { fontBoundingBoxAscent: style.fontBoundingBoxAscent }
        : {}),
      ...(style?.fontBoundingBoxDescent != null
        ? { fontBoundingBoxDescent: style.fontBoundingBoxDescent }
        : {}),
      ...(style?.fontAscent != null ? { fontAscent: style.fontAscent } : {}),
      ...(style?.fontDescent != null ? { fontDescent: style.fontDescent } : {}),
      ...(style?.fontWidth != null ? { fontWidth: style.fontWidth } : {}),
      hasEOL: Boolean(raw.hasEOL),
    });
  }
  return items;
}
function fontNamesFromItems(items: TextItem[]): Set<string> {
  const names = new Set<string>();
  for (const item of items) {
    if (item.fontName) names.add(item.fontName);
  }
  return names;
}
function pickBestTextBox(boxes: TextBoxPosition[]): TextBoxPosition {
  return boxes.reduce((best, box) => {
    const area = box.width * box.height;
    const bestArea = best.width * best.height;
    return area > bestArea ? box : best;
  });
}

function pickNearestOrBiggest(
  boxes: TextBoxPosition[],
  anchor?: { xNorm: number; yNorm: number },
  pageSize?: { width: number; height: number },
): TextBoxPosition[] {
  if (anchor && pageSize) return [pickBestTextBoxNearAnchor(boxes, anchor, pageSize)];
  return [pickBestTextBox(boxes)];
}

function boxCenter(box: TextBoxPosition): { x: number; y: number } {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

function distanceSq(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function pageAnchorNormToPdfPoint(
  anchor: { xNorm: number; yNorm: number },
  pageWidth: number,
  pageHeight: number,
): { x: number; y: number } {
  return {
    x: anchor.xNorm * pageWidth,
    y: pageHeight * (1 - anchor.yNorm),
  };
}

export function pickBestTextBoxNearAnchor(
  boxes: TextBoxPosition[],
  anchor?: { xNorm: number; yNorm: number },
  pageSize?: { width: number; height: number },
): TextBoxPosition {
  if (boxes.length === 0) {
    throw new Error('pickBestTextBoxNearAnchor: no boxes');
  }
  if (boxes.length === 1 || !anchor || !pageSize) {
    return pickBestTextBox(boxes);
  }
  const anchorPdf = pageAnchorNormToPdfPoint(anchor, pageSize.width, pageSize.height);
  return boxes.reduce((best, box) => {
    const bc = boxCenter(box);
    const bestC = boxCenter(best);
    return distanceSq(bc, anchorPdf) < distanceSq(bestC, anchorPdf) ? box : best;
  });
}

export function editPositionKey(edit: {
  originalText: string;
  anchor?: { xNorm: number; yNorm: number };
}): string {
  if (edit.anchor) {
    return `${edit.originalText}@${edit.anchor.xNorm.toFixed(4)}:${edit.anchor.yNorm.toFixed(4)}`;
  }
  return edit.originalText;
}
export function searchTextInItems(
  items: TextItem[],
  searchText: string,
  anchor?: { xNorm: number; yNorm: number },
  pageSize?: { width: number; height: number },
): TextBoxPosition[] {
  const needle = norm(searchText);
  if (!needle) return [];
  const sorted = sortItemsReadingOrder(items);

  if (searchText.includes('\n') && shouldSearchLineByLine(searchText)) {
    const listBoxes = searchListLinesInItems(items, searchText, anchor, pageSize);
    if (listBoxes.length > 0) return listBoxes;
  }

  if (needle.length > 24 || needle.includes(' ')) {
    const span = findSpanInReadingOrder(sorted, searchText);
    if (span) return [span];
  }

  const variants = [needle];
  if (searchText.includes('\n')) {
    variants.push(norm(searchText.replace(/\n+/g, ' ')));
  }
  if (/_{2,}/.test(needle)) {
    const relaxed = needle.replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();
    if (relaxed !== needle) variants.push(relaxed);
  }
  const preferConcatenated = needle.length > 24 || needle.includes(' ');
  for (const variant of variants) {
    if (preferConcatenated) {
      const concat = searchConcatenatedItems(sorted, variant);
      if (concat.length > 0) return concat;
    }
    const single = searchSingleItems(sorted, variant);
    if (single.length > 0) {
      return single.length === 1 ? single : pickNearestOrBiggest(single, anchor, pageSize);
    }
    if (!preferConcatenated) {
      const concat = searchConcatenatedItems(sorted, variant);
      if (concat.length > 0) return concat;
    }
  }
  const flexRe = buildUnderscoreFlexRegex(needle);
  if (flexRe) {
    const flex = searchSingleItemsRegex(sorted, flexRe);
    if (flex.length > 0) {
      return flex.length === 1 ? flex : pickNearestOrBiggest(flex, anchor, pageSize);
    }
  }
  return [];
}
function buildUnderscoreFlexRegex(needle: string): RegExp | null {
  if (!/_{3,}/.test(needle)) return null;
  const parts = needle
    .split(/_+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;
  const escaped = parts.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(escaped.join('_{1,}'), 'iu');
}
function searchSingleItemsRegex(items: TextItem[], re: RegExp): TextBoxPosition[] {
  const results: TextBoxPosition[] = [];
  for (const item of items) {
    const haystack = norm(item.str);
    if (!haystack) continue;
    const match = re.exec(haystack);
    if (!match) continue;
    results.push(
      textSubstringBox(item, match.index, match[0].length, haystack.length),
    );
  }
  return results;
}
function searchSingleItems(items: TextItem[], needle: string): TextBoxPosition[] {
  const results: TextBoxPosition[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const haystack = norm(item.str);
    if (!haystack) continue;
    const idx = haystack.indexOf(needle);
    if (idx === -1) continue;
    results.push(textSubstringBox(item, idx, needle.length, haystack.length));
  }
  return results;
}
function searchConcatenatedItems(items: TextItem[], needle: string): TextBoxPosition[] {
  for (let i = 0; i < items.length; i++) {
    let built = '';
    let startItem: TextItem | null = null;
    let lastY = items[i]!.y;
    const lineH = (items[i]!.height || items[i]!.fontSize || 10) * 1.5;
    for (let j = i; j < items.length; j++) {
      const item = items[j]!;
      if (startItem && j > i) {
        const yGap = Math.abs(item.y - lastY);
        const sameColumn = Math.abs(item.x - startItem.x) < 120;
        if (yGap > lineH && !sameColumn) break;
        if (yGap > lineH * 0.4 && sameColumn) built += ' ';
      }
      if (!startItem) startItem = item;
      lastY = item.y;
      built += item.str;
      const normalized = norm(built);
      if (normalized.includes(needle)) {
        const spanItems = items.slice(i, j + 1);
        return [unionManyBoxes(spanItems.map(itemBox))];
      }
      if (normalized.length > needle.length * 2 + 120) break;
    }
  }
  return [];
}
export function expandEraseRegion(
  items: TextItem[],
  anchor: TextBoxPosition,
  originalText: string,
  suggestion: string,
): TextBoxPosition {
  let region = { ...anchor };
  const normOrig = norm(originalText);
  const normSug = norm(suggestion);
  const lineH = anchor.height / 1.3;
  for (const item of items) {
    const t = norm(item.str);
    if (!t || t.length < 2) continue;
    const inOrig = normOrig.includes(t);
    const inSug = normSug.includes(t);
    const extraWords = t
      .split(' ')
      .filter((w) => w.length > 2)
      .some((w) => normSug.includes(w) && !normOrig.includes(w));
    if (!inSug && !extraWords) continue;
    if (inOrig && normOrig.length >= normSug.length) continue;
    const box = itemBox(item);
    const hOverlap = box.x < region.x + region.width + 48 && box.x + box.width > region.x - 48;
    const verticallyClose =
      Math.abs(item.y - (region.y + region.height * 0.5)) < lineH * 4 ||
      (item.y < region.y + lineH && region.y - item.y < lineH * 3);
    if (hOverlap && verticallyClose) {
      region = unionBoxes(region, box);
    }
  }
  return region;
}
export async function findTextPositions(
  buffer: Buffer,
  pageNumber: number,
  searchText: string,
): Promise<TextBoxPosition[]> {
  const task = getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    disableFontFace: true,
    standardFontDataUrl,
    verbosity: VerbosityLevel.ERRORS,
  });
  const pdf = await task.promise;
  try {
    if (pageNumber < 1 || pageNumber > pdf.numPages) return [];
    const page = await pdf.getPage(pageNumber);
    const items = await collectPageTextItems(page);
    return searchTextInItems(items, searchText);
  } finally {
    await pdf.destroy();
  }
}
export type PdfTextLayerReport = {
  hasTextLayer: boolean;
  pageCount: number;
  pagesWithText: number[];
  pagesWithoutText: number[];
  totalChars: number;
};
export async function inspectPdfTextLayer(buffer: Buffer): Promise<PdfTextLayerReport> {
  const task = getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    disableFontFace: true,
    standardFontDataUrl,
    verbosity: VerbosityLevel.ERRORS,
  });
  const pdf = await task.promise;
  try {
    const pageCount = pdf.numPages;
    const pagesWithText: number[] = [];
    const pagesWithoutText: number[] = [];
    let totalChars = 0;
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const items = await collectPageTextItems(page);
      const chars = items.reduce((sum, item) => sum + item.str.length, 0);
      totalChars += chars;
      if (chars > 20) pagesWithText.push(pageNumber);
      else pagesWithoutText.push(pageNumber);
    }
    return {
      hasTextLayer: totalChars > 40,
      pageCount,
      pagesWithText,
      pagesWithoutText,
      totalChars,
    };
  } finally {
    await pdf.destroy();
  }
}
export async function findAllTextPositions(
  buffer: Buffer,
  edits: Array<{
    page: number;
    originalText: string;
    suggestion?: string;
    anchor?: { xNorm: number; yNorm: number };
  }>,
): Promise<{
  positions: Map<number, Map<string, TextMatch[]>>;
  itemsByPage: Map<number, TextItem[]>;
  fontBytesByName: Map<string, Uint8Array>;
}> {
  const task = getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    disableFontFace: true,
    standardFontDataUrl,
    verbosity: VerbosityLevel.ERRORS,
  });
  const pdf = await task.promise;
  const positions = new Map<number, Map<string, TextMatch[]>>();
  const itemsByPage = new Map<number, TextItem[]>();
  const fontBytesByName = new Map<string, Uint8Array>();
  try {
    const grouped = new Map<number, typeof edits>();
    for (const edit of edits) {
      const page = edit.page;
      if (!grouped.has(page)) grouped.set(page, []);
      grouped.get(page)!.push(edit);
    }
    for (const [pageNumber, pageEdits] of grouped) {
      if (pageNumber < 1 || pageNumber > pdf.numPages) continue;
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const pageSize = { width: viewport.width, height: viewport.height };
      const items = sortItemsReadingOrder(await collectPageTextItems(page));
      itemsByPage.set(pageNumber, items);
      const pageMap = new Map<string, TextMatch[]>();
      for (const edit of pageEdits) {
        const boxes = searchTextInItems(items, edit.originalText, edit.anchor, pageSize);
        if (boxes.length > 0) {
          const match =
            boxes.length > 1
              ? edit.suggestion
                ? toMatchFromLineBoxes(items, boxes, edit.originalText, edit.suggestion)
                : toHighlightMatch(items, boxes, edit.originalText)
              : toMatch(items, boxes[0]!, edit.originalText, edit.suggestion ?? '');
          pageMap.set(editPositionKey(edit), [match]);
        }
      }
      if (pageMap.size > 0) {
        positions.set(pageNumber, pageMap);
      }
      const pageFontNames = fontNamesFromItems(items);
      const fontBytes = await collectEmbeddedFontBytes(page, pageFontNames);
      for (const [name, bytes] of fontBytes) {
        fontBytesByName.set(name, bytes);
      }
    }
  } finally {
    await pdf.destroy();
  }
  return { positions, itemsByPage, fontBytesByName };
}

export async function extractPageLayoutSignatures(buffer: Buffer): Promise<PageLayoutSignature[]> {
  const task = getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    disableFontFace: true,
    standardFontDataUrl,
    verbosity: VerbosityLevel.ERRORS,
  });
  const pdf = await task.promise;
  const signatures: PageLayoutSignature[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const items = sortItemsReadingOrder(await collectPageTextItems(page));
      signatures.push(
        buildPageLayoutSignature(
          pageNumber,
          items.map((item) => ({ x: item.x, y: item.y })),
        ),
      );
    }
  } finally {
    await pdf.destroy();
  }
  return signatures;
}
