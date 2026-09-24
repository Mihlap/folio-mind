import type { TextItem } from './find-text-positions.js';
import type { PdfTextStyle } from './pdf-edit-fonts.js';
import { textItemBox } from './pdf-text-bounds.js';
export type MatchedLine = {
  x: number;
  y: number;
  width: number;
  box: { x: number; y: number; width: number; height: number };
  style: PdfTextStyle;
  originalText: string;
  items: TextItem[];
};
function norm(str: string): string {
  return str.replace(/\s+/g, ' ').trim();
}
function itemBox(item: TextItem): { x: number; y: number; width: number; height: number } {
  return textItemBox(item);
}
function unionBoxes(boxes: Array<{ x: number; y: number; width: number; height: number }>): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const x1 = Math.min(...boxes.map((b) => b.x));
  const y1 = Math.min(...boxes.map((b) => b.y));
  const x2 = Math.max(...boxes.map((b) => b.x + b.width));
  const y2 = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}
function styleFromItems(items: TextItem[]): PdfTextStyle {
  if (items.length === 0) {
    return { fontSize: 12, fontName: '', fontFamily: 'sans-serif', lineHeight: 14 };
  }
  const primary = items.reduce((best, item) =>
    item.str.length > best.str.length ? item : best,
  );
  const fontSize = Math.max(6, Math.min(primary.fontSize || primary.height || 12, 72));
  return {
    fontSize,
    fontName: primary.fontName,
    fontFamily: primary.fontFamily,
    lineHeight: Math.max(fontSize, primary.height || fontSize) * 1.15,
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
export function groupItemsByLine(items: TextItem[]): TextItem[][] {
  if (items.length === 0) return [];
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const groups: TextItem[][] = [];
  let current: TextItem[] = [sorted[0]!];
  let currentY = sorted[0]!.y;
  const threshold = Math.max(sorted[0]!.height || sorted[0]!.fontSize, 6) * 0.45;
  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i]!;
    if (Math.abs(item.y - currentY) <= threshold) {
      current.push(item);
    } else {
      current.sort((a, b) => a.x - b.x);
      groups.push(current);
      current = [item];
      currentY = item.y;
    }
  }
  current.sort((a, b) => a.x - b.x);
  groups.push(current);
  return groups;
}
function itemsToLine(group: TextItem[]): MatchedLine {
  const boxes = group.map(itemBox);
  const box = unionBoxes(boxes);
  const originalText = group.map((i) => i.str).join('');
  return {
    x: group[0]!.x,
    y: group[0]!.y,
    width: box.width,
    box,
    style: styleFromItems(group),
    originalText,
    items: group,
  };
}
export function buildMatchedLines(
  items: TextItem[],
  matchedItems: TextItem[],
  searchText: string,
  suggestion: string,
): MatchedLine[] {
  let lines = groupItemsByLine(matchedItems).map(itemsToLine);
  if (lines.length > 1) return lines;
  const anchor = lines[0];
  if (!anchor) return lines;
  const lineH = anchor.style.lineHeight;
  const normSearch = norm(searchText);
  const normSug = norm(suggestion);
  const extra: TextItem[] = [];
  for (const item of items) {
    if (matchedItems.includes(item)) continue;
    const sameColumn = Math.abs(item.x - anchor.x) < 140;
    const below = item.y < anchor.y - lineH * 0.2 && item.y > anchor.y - lineH * 2.8;
    if (!sameColumn || !below) continue;
    const t = norm(item.str);
    if (!t) continue;
    if (normSearch.includes(t) || normSug.includes(t)) extra.push(item);
  }
  if (extra.length > 0) {
    lines = groupItemsByLine([...matchedItems, ...extra]).map(itemsToLine);
  }
  return lines;
}
export function explicitTextLines(text: string): string[] {
  return text
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function paragraphDrawMode(
  layoutLineCount: number,
  suggestion: string,
): 'per-line' | 'unified' | 'expanded' {
  const explicit = explicitTextLines(suggestion);
  if (layoutLineCount <= 1) return 'per-line';
  if (explicit.length > layoutLineCount) return 'expanded';
  if (explicit.length === layoutLineCount && explicit.length > 1) return 'per-line';
  return 'unified';
}

export function splitSuggestionByOriginalLines(
  originalLines: string[],
  suggestion: string,
): string[] {
  const trimmed = suggestion.trim();
  if (!trimmed) return [];
  const explicit = trimmed
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (explicit.length > originalLines.length) return explicit;
  if (explicit.length === originalLines.length) return explicit;
  if (originalLines.length <= 1) return [trimmed];
  const sugWords = trimmed.split(/\s+/).filter(Boolean);
  const result: string[] = [];
  let end = sugWords.length;
  for (let i = originalLines.length - 1; i >= 1; i--) {
    const lineWords = originalLines[i]!.split(/\s+/).filter(Boolean);
    if (lineWords.length === 0) continue;
    const tail = sugWords.slice(end - lineWords.length, end).join(' ');
    if (norm(tail) === norm(originalLines[i]!)) {
      result.unshift(tail);
      end -= lineWords.length;
      continue;
    }
    const origNorm = norm(originalLines[i]!);
    const prefix = sugWords.slice(0, end).join(' ');
    if (norm(prefix).endsWith(origNorm)) {
      result.unshift(sugWords.slice(end - lineWords.length, end).join(' '));
      end -= lineWords.length;
    }
  }
  result.unshift(sugWords.slice(0, end).join(' '));
  return result.length === originalLines.length ? result : explicit.length > 1 ? explicit : result;
}
