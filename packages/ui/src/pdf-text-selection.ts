import type { PdfSelectionHighlightRect } from './PdfTextSelectionHighlight.js';
export type PdfTextSelectionSnapshot = {
  text: string;
  rect: DOMRect;
  highlightRects: PdfSelectionHighlightRect[];
};
export type PdfTextSelectionDrag = {
  textLayer: HTMLElement;
  pageRoot: HTMLElement;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
};
const TINY_DRAG_PX = 5;
const MIN_EXTRACTED_LEN = 1;
const MAX_QUOTE_LEN = 4000;
export function normalizePdfSelectionText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}
export function isTextLayerSelectable(layer: HTMLElement | null): boolean {
  if (!layer?.classList.contains('textLayer')) return false;
  return layer.classList.contains('select-text') || layer.classList.contains('textLayer--quote');
}
export function pdfPageRootFromTextLayer(textLayer: HTMLElement): HTMLElement | null {
  const pageRoot = textLayer.closest('[data-pdf-page]');
  return pageRoot instanceof HTMLElement ? pageRoot : null;
}
function rectsIntersect(a: DOMRect, b: DOMRect): boolean {
  return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
}
function clientRectFromPoints(x1: number, y1: number, x2: number, y2: number): DOMRect {
  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2);
  return new DOMRect(left, top, Math.abs(x2 - x1), Math.abs(y2 - y1));
}
const LINE_Y_TOLERANCE_PX = 4;
const NEAREST_SPAN_MAX_SCORE = 48;

function rangeEndX(range: Range): number {
  const rects = Array.from(range.getClientRects());
  if (rects.length === 0) return range.getBoundingClientRect().right;
  return rects[rects.length - 1].right;
}

function caretOffsetInTextNode(x: number, textNode: Text): number {
  const len = textNode.textContent?.length ?? 0;
  if (len === 0) return 0;

  let low = 0;
  let high = len;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, mid);
    if (rangeEndX(range) < x) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
}

function spanTextNode(span: HTMLElement): Text | null {
  const textNode = span.firstChild;
  return textNode instanceof Text ? textNode : null;
}

function findSpanAtPoint(x: number, y: number, textLayer: HTMLElement): HTMLElement | null {
  for (const el of document.elementsFromPoint(x, y)) {
    if (!(el instanceof HTMLElement)) continue;
    const span = el.closest('span');
    if (span instanceof HTMLElement && textLayer.contains(span)) return span;
  }

  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const span of textLayer.querySelectorAll('span')) {
    if (!(span instanceof HTMLElement)) continue;
    const r = span.getBoundingClientRect();
    if (r.width <= 0 && r.height <= 0) continue;

    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
      return span;
    }

    const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
    if (dy > LINE_Y_TOLERANCE_PX) continue;

    const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
    const score = dy * 1000 + dx;
    if (score < bestScore) {
      bestScore = score;
      best = span;
    }
  }
  return bestScore <= NEAREST_SPAN_MAX_SCORE ? best : null;
}

function caretRangeAtPoint(x: number, y: number): Range | null {
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => CaretPosition | null;
  };
  if (doc.caretRangeFromPoint) {
    return doc.caretRangeFromPoint(x, y);
  }
  const pos = doc.caretPositionFromPoint?.(x, y);
  if (!pos) return null;
  const range = document.createRange();
  range.setStart(pos.offsetNode, pos.offset);
  range.setEnd(pos.offsetNode, pos.offset);
  return range;
}

function caretRangeAtPointInTextLayer(x: number, y: number, textLayer: HTMLElement): Range | null {
  const span = findSpanAtPoint(x, y, textLayer);
  if (span) {
    const textNode = spanTextNode(span);
    if (textNode) {
      const offset = caretOffsetInTextNode(x, textNode);
      const range = document.createRange();
      range.setStart(textNode, offset);
      range.setEnd(textNode, offset);
      return range;
    }
  }

  const caret = caretRangeAtPoint(x, y);
  if (caret && textLayer.contains(caret.startContainer)) return caret;
  return null;
}
function rangeFromCaretPoints(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  textLayer: HTMLElement,
): Range | null {
  const startCaret = caretRangeAtPointInTextLayer(x1, y1, textLayer);
  const endCaret = caretRangeAtPointInTextLayer(x2, y2, textLayer);
  if (!startCaret || !endCaret) return null;
  const range = document.createRange();
  const backward = startCaret.compareBoundaryPoints(Range.START_TO_START, endCaret) > 0;
  if (!backward) {
    range.setStart(startCaret.startContainer, startCaret.startOffset);
    range.setEnd(endCaret.startContainer, endCaret.startOffset);
  } else {
    range.setStart(endCaret.startContainer, endCaret.startOffset);
    range.setEnd(startCaret.startContainer, startCaret.startOffset);
  }
  if (range.collapsed) return null;
  return range;
}
function snapshotFromRange(
  range: Range,
  textLayer: HTMLElement,
  pageRoot: HTMLElement,
): {
  text: string;
  highlightRects: PdfSelectionHighlightRect[];
  rect: DOMRect;
} | null {
  const text = getTextFromRange(range, textLayer);
  if (text.length < MIN_EXTRACTED_LEN) return null;
  const highlightRects = selectionHighlightRectsInPage(range, pageRoot);
  const clientRects = Array.from(range.getClientRects()).filter((r) => r.width > 0 || r.height > 0);
  const rect =
    clientRects.length > 0 ? unionClientRect(clientRects) : range.getBoundingClientRect();
  return { text, highlightRects, rect };
}
export function getTextFromCaretPoints(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  textLayer: HTMLElement,
  pageRoot: HTMLElement,
): {
  text: string;
  highlightRects: PdfSelectionHighlightRect[];
  rect: DOMRect;
} | null {
  const range = rangeFromCaretPoints(x1, y1, x2, y2, textLayer);
  if (!range) return null;
  return snapshotFromRange(range, textLayer, pageRoot);
}
function isWordChar(ch: string): boolean {
  return /[\p{L}\p{N}]/u.test(ch);
}
export function expandRangeToWord(range: Range, textLayer: HTMLElement): Range | null {
  const out = range.cloneRange();
  const startNode = out.startContainer;
  const endNode = out.endContainer;
  if (startNode.nodeType !== Node.TEXT_NODE || endNode.nodeType !== Node.TEXT_NODE) return null;
  if (!textLayer.contains(startNode) || !textLayer.contains(endNode)) return null;
  const startText = startNode as Text;
  const endText = endNode as Text;
  let start = out.startOffset;
  let end = out.endOffset;
  const startContent = startText.textContent ?? '';
  const endContent = endText.textContent ?? '';
  while (start > 0 && isWordChar(startContent[start - 1] ?? '')) start -= 1;
  while (end < endContent.length && isWordChar(endContent[end] ?? '')) end += 1;
  if (start >= end) return null;
  out.setStart(startText, start);
  out.setEnd(endText, end);
  return out;
}
function isTextNodeInRange(node: Text, range: Range): boolean {
  try {
    return range.intersectsNode(node);
  } catch {
    const probe = document.createRange();
    probe.selectNodeContents(node);
    return (
      range.compareBoundaryPoints(Range.END_TO_START, probe) < 0 &&
      range.compareBoundaryPoints(Range.START_TO_END, probe) > 0
    );
  }
}
function sliceTextNode(node: Text, range: Range): string {
  const full = node.textContent ?? '';
  if (!full) return '';
  let start = 0;
  let end = full.length;
  if (range.startContainer === node) start = range.startOffset;
  if (range.endContainer === node) end = range.endOffset;
  if (start >= end) return '';
  return full.slice(start, end);
}
export function getTextFromRange(range: Range, textLayer: HTMLElement): string {
  const lineTexts: string[] = [];
  let lineChunks: string[] = [];
  let lastTop: number | null = null;
  const walker = document.createTreeWalker(textLayer, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (!(node instanceof Text)) continue;
    if (!isTextNodeInRange(node, range)) continue;
    const slice = sliceTextNode(node, range);
    if (!slice) continue;
    const parent = node.parentElement;
    const top = parent?.getBoundingClientRect().top ?? null;
    if (top != null && lastTop != null && Math.abs(top - lastTop) > 2) {
      if (lineChunks.length > 0) {
        lineTexts.push(normalizePdfSelectionText(lineChunks.join('')));
        lineChunks = [];
      }
    }
    lineChunks.push(slice);
    if (top != null) lastTop = top;
  }
  if (lineChunks.length > 0) {
    lineTexts.push(normalizePdfSelectionText(lineChunks.join('')));
  }
  if (lineTexts.length <= 1) return lineTexts[0] ?? '';
  return lineTexts.filter(Boolean).join('\n');
}
export function textLayerForRange(range: Range, root: HTMLElement): HTMLElement | null {
  const startEl =
    range.startContainer instanceof Element
      ? range.startContainer
      : range.startContainer.parentElement;
  const endEl =
    range.endContainer instanceof Element ? range.endContainer : range.endContainer.parentElement;
  const startLayer = startEl?.closest('.textLayer');
  const endLayer = endEl?.closest('.textLayer');
  if (
    !startLayer ||
    !(startLayer instanceof HTMLElement) ||
    startLayer !== endLayer ||
    !root.contains(startLayer)
  ) {
    return null;
  }
  return startLayer;
}
export function highlightRectsForSpans(
  spans: Element[],
  pageRoot: HTMLElement,
): PdfSelectionHighlightRect[] {
  const pageRect = pageRoot.getBoundingClientRect();
  const seen = new Set<string>();
  const out: PdfSelectionHighlightRect[] = [];
  for (const span of spans) {
    const r = span.getBoundingClientRect();
    if (r.width <= 0 && r.height <= 0) continue;
    const left = r.left - pageRect.left;
    const top = r.top - pageRect.top;
    const key = `${Math.round(left)}:${Math.round(top)}:${Math.round(r.width)}:${Math.round(r.height)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ left, top, width: r.width, height: r.height });
  }
  return out;
}
export function getTextFromDragRect(
  dragRect: DOMRect,
  textLayer: HTMLElement,
  pageRoot: HTMLElement,
): {
  text: string;
  highlightRects: PdfSelectionHighlightRect[];
  rect: DOMRect;
} | null {
  const hits: Element[] = [];
  const parts: string[] = [];
  for (const span of textLayer.querySelectorAll('span')) {
    const r = span.getBoundingClientRect();
    if (r.width <= 0 && r.height <= 0) continue;
    if (!rectsIntersect(r, dragRect)) continue;
    hits.push(span);
    const t = span.textContent ?? '';
    if (t) parts.push(t);
  }
  const text = normalizePdfSelectionText(parts.join(''));
  if (text.length < MIN_EXTRACTED_LEN) return null;
  const highlightRects = highlightRectsForSpans(hits, pageRoot);
  const rect =
    highlightRects.length > 0
      ? unionClientRect(
          hits.map((s) => s.getBoundingClientRect()).filter((r) => r.width > 0 || r.height > 0),
        )
      : dragRect;
  return { text, highlightRects, rect };
}
function unionClientRect(rects: DOMRect[]): DOMRect {
  if (rects.length === 0) return new DOMRect(0, 0, 0, 0);
  let left = rects[0].left;
  let top = rects[0].top;
  let right = rects[0].right;
  let bottom = rects[0].bottom;
  for (let i = 1; i < rects.length; i++) {
    left = Math.min(left, rects[i].left);
    top = Math.min(top, rects[i].top);
    right = Math.max(right, rects[i].right);
    bottom = Math.max(bottom, rects[i].bottom);
  }
  return new DOMRect(left, top, right - left, bottom - top);
}
export function getWordSelectionAtPoint(
  x: number,
  y: number,
  textLayer: HTMLElement,
  pageRoot: HTMLElement,
): {
  text: string;
  highlightRects: PdfSelectionHighlightRect[];
  rect: DOMRect;
} | null {
  const caret = caretRangeAtPointInTextLayer(x, y, textLayer);
  if (!caret) return null;
  const wordRange = expandRangeToWord(caret, textLayer);
  if (!wordRange) return null;
  return snapshotFromRange(wordRange, textLayer, pageRoot);
}
export function readBrowserSelectionInTextLayer(
  textLayer: HTMLElement,
  pageRoot: HTMLElement,
): {
  text: string;
  highlightRects: PdfSelectionHighlightRect[];
  rect: DOMRect;
} | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!textLayer.contains(range.commonAncestorContainer)) return null;
  const text = getTextFromRange(range, textLayer);
  if (text.length < MIN_EXTRACTED_LEN) return null;
  const hits: Element[] = [];
  for (const span of textLayer.querySelectorAll('span')) {
    try {
      if (range.intersectsNode(span)) hits.push(span);
    } catch {
      // Some detached text-layer nodes can make intersectsNode throw; skip them.
    }
  }
  const highlightRects = selectionHighlightRectsInPage(range, pageRoot);
  const clientRects = Array.from(range.getClientRects()).filter((r) => r.width > 0 || r.height > 0);
  const rect =
    clientRects.length > 0 ? unionClientRect(clientRects) : range.getBoundingClientRect();
  return { text, highlightRects, rect };
}
export function captureTextSelectionFromDrag(
  drag: PdfTextSelectionDrag,
  endX: number,
  endY: number,
): PdfTextSelectionSnapshot | null {
  const { textLayer, pageRoot, startX, startY } = drag;
  const dragRect = clientRectFromPoints(startX, startY, endX, endY);
  const isTiny = dragRect.width < TINY_DRAG_PX && dragRect.height < TINY_DRAG_PX;
  const attempts: Array<{
    text: string;
    highlightRects: PdfSelectionHighlightRect[];
    rect: DOMRect;
  } | null> = isTiny
    ? [getWordSelectionAtPoint(endX, endY, textLayer, pageRoot)]
    : [getTextFromCaretPoints(startX, startY, endX, endY, textLayer, pageRoot)];
  for (const captured of attempts) {
    if (!captured) continue;
    const text = captured.text.slice(0, MAX_QUOTE_LEN);
    if (!text) continue;
    const rect = captured.rect;
    if (rect.width === 0 && rect.height === 0) continue;
    return { text, rect, highlightRects: captured.highlightRects };
  }
  return null;
}
export function pdfPageRootFromSelection(root: HTMLElement | null): HTMLElement | null {
  if (!root) return null;
  const sel = window.getSelection();
  if (!sel?.anchorNode) return null;
  const node = sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode.parentElement;
  const pageRoot = node?.closest('[data-pdf-page]');
  if (!pageRoot || !(pageRoot instanceof HTMLElement) || !root.contains(pageRoot)) return null;
  return pageRoot;
}
export function selectionHighlightRectsInPage(
  range: Range,
  pageRoot: HTMLElement,
): PdfSelectionHighlightRect[] {
  const pageRect = pageRoot.getBoundingClientRect();
  const seen = new Set<string>();
  const out: PdfSelectionHighlightRect[] = [];
  for (const r of range.getClientRects()) {
    if (r.width <= 0 && r.height <= 0) continue;
    const left = r.left - pageRect.left;
    const top = r.top - pageRect.top;
    const key = `${Math.round(left)}:${Math.round(top)}:${Math.round(r.width)}:${Math.round(r.height)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ left, top, width: r.width, height: r.height });
  }
  return out;
}
export function readPdfTextSelection(root: HTMLElement | null): PdfTextSelectionSnapshot | null {
  if (!root) return null;
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;
  const textLayer = textLayerForRange(range, root);
  const pageRoot = textLayer ? pdfPageRootFromTextLayer(textLayer) : pdfPageRootFromSelection(root);
  const text = textLayer
    ? getTextFromRange(range, textLayer)
    : normalizePdfSelectionText(sel.toString());
  if (!text) return null;
  const clientRects = Array.from(range.getClientRects()).filter((r) => r.width > 0 || r.height > 0);
  const rect =
    clientRects.length > 0 ? unionClientRect(clientRects) : range.getBoundingClientRect();
  const highlightRects = pageRoot != null ? selectionHighlightRectsInPage(range, pageRoot) : [];
  return { text: text.slice(0, MAX_QUOTE_LEN), rect, highlightRects };
}
export function pageNumberFromSelection(root: HTMLElement | null): number | null {
  const pageRoot = pdfPageRootFromSelection(root);
  if (!pageRoot) return null;
  const fromPdfPage = Number(pageRoot.getAttribute('data-pdf-page'));
  if (Number.isFinite(fromPdfPage) && fromPdfPage > 0) return fromPdfPage;
  const page = Number(pageRoot.closest('[data-page]')?.getAttribute('data-page'));
  return Number.isFinite(page) && page > 0 ? page : null;
}
export function pageNumberFromPageRoot(pageRoot: HTMLElement): number | null {
  const page = Number(pageRoot.getAttribute('data-pdf-page'));
  return Number.isFinite(page) && page > 0 ? page : null;
}
export function clearDocumentSelection() {
  window.getSelection()?.removeAllRanges();
}
