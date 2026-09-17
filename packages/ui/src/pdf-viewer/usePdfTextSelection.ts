import { useEffect, useRef } from 'react';
import {
  captureTextSelectionFromDrag,
  clearDocumentSelection,
  getTextFromCaretPoints,
  getWordSelectionAtPoint,
  isTextLayerSelectable,
  pageNumberFromPageRoot,
  pageNumberFromSelection,
  pdfPageRootFromSelection,
  pdfPageRootFromTextLayer,
  readPdfTextSelection,
  type PdfTextSelectionDrag,
} from '../pdf-text-selection.js';
import type { PdfSelectionHighlightRect } from '../PdfTextSelectionHighlight.js';

export type PdfSelectionPrompt = {
  text: string;
  page: number;
  x: number;
  y: number;
  pageWidthPx: number;
  pageHeightPx: number;
  highlightRects: PdfSelectionHighlightRect[];
};

export type PdfLiveSelection = {
  page: number;
  highlightRects: PdfSelectionHighlightRect[];
};

type UsePdfTextSelectionParams = {
  containerRef: React.RefObject<HTMLDivElement | null>;
  enableTextSelection: boolean;
  textSelectionActive: boolean;
  pdfReady: boolean;
  displayMode: string;
  url: string;
  onPromptChange: (prompt: PdfSelectionPrompt | null) => void;
  onLiveSelectionChange?: (selection: PdfLiveSelection | null) => void;
  selectionQuoteRef: React.MutableRefObject<string>;
};

const TOUCH_TAP_SLOP_PX = 12;

export function usePdfTextSelection({
  containerRef,
  enableTextSelection,
  textSelectionActive,
  pdfReady,
  displayMode,
  url,
  onPromptChange,
  onLiveSelectionChange,
  selectionQuoteRef,
}: UsePdfTextSelectionParams) {
  const selectionDragRef = useRef<PdfTextSelectionDrag | null>(null);

  useEffect(() => {
    onPromptChange(null);
    onLiveSelectionChange?.(null);
  }, [url, enableTextSelection, onPromptChange, onLiveSelectionChange]);

  useEffect(() => {
    if (!enableTextSelection) return;
    const root = containerRef.current;
    if (!root) return;

    const releaseDragTouchLock = () => {
      const drag = selectionDragRef.current;
      if (drag?.textLayer) {
        drag.textLayer.style.touchAction = '';
        drag.textLayer.style.webkitUserSelect = '';
        drag.textLayer.style.setProperty('-webkit-touch-callout', '');
      }
      selectionDragRef.current = null;
    };

    const onDocPointerMove = (e: PointerEvent) => {
      const drag = selectionDragRef.current;
      if (!drag) return;
      if (drag.pointerType !== undefined && drag.pointerType !== 'mouse' && !e.isPrimary) return;
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;

      const preview = getTextFromCaretPoints(
        drag.startX,
        drag.startY,
        e.clientX,
        e.clientY,
        drag.textLayer,
        drag.pageRoot,
      );
      const page = pageNumberFromPageRoot(drag.pageRoot);
      if (preview && page) {
        onLiveSelectionChange?.({ page, highlightRects: preview.highlightRects });
      }
    };

    const finishSelection = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('[data-pdf-selection-ui]')) {
        releaseDragTouchLock();
        return;
      }

      const drag = selectionDragRef.current;
      if (drag) {
        drag.lastX = e.clientX;
        drag.lastY = e.clientY;
      }
      const endX = drag?.lastX ?? e.clientX;
      const endY = drag?.lastY ?? e.clientY;
      const endedDrag = drag;
      releaseDragTouchLock();
      onLiveSelectionChange?.(null);

      requestAnimationFrame(() => {
        let snap: ReturnType<typeof readPdfTextSelection> = null;
        if (endedDrag) {
          const isTouch =
            endedDrag.pointerType !== undefined && endedDrag.pointerType !== 'mouse';
          if (
            isTouch &&
            Math.abs(endedDrag.startX - endX) < TOUCH_TAP_SLOP_PX &&
            Math.abs(endedDrag.startY - endY) < TOUCH_TAP_SLOP_PX
          ) {
            snap = getWordSelectionAtPoint(
              endX,
              endY,
              endedDrag.textLayer,
              endedDrag.pageRoot,
            );
          }
          if (!snap) snap = captureTextSelectionFromDrag(endedDrag, endX, endY);
        }
        if (!snap) {
          snap = readPdfTextSelection(root);
        }
        clearDocumentSelection();
        if (!snap) {
          onPromptChange(null);
          selectionQuoteRef.current = '';
          return;
        }
        const pageNum =
          (endedDrag ? pageNumberFromPageRoot(endedDrag.pageRoot) : null) ??
          pageNumberFromSelection(root);
        if (!pageNum) return;
        const pageRect = (
          endedDrag?.pageRoot ?? pdfPageRootFromSelection(root)
        )?.getBoundingClientRect();
        const pageWidthPx = pageRect?.width ?? 0;
        const pageHeightPx = pageRect?.height ?? 0;
        const anchorX = snap.rect.width > 0 || snap.rect.left > 0 ? snap.rect.left : endX;
        const anchorY =
          snap.rect.height > 0 || snap.rect.bottom > 0 ? snap.rect.bottom + 6 : endY + 6;
        selectionQuoteRef.current = snap.text;
        onPromptChange({
          text: snap.text,
          page: pageNum,
          x: anchorX,
          y: anchorY,
          pageWidthPx: pageWidthPx > 0 ? pageWidthPx : 1,
          pageHeightPx: pageHeightPx > 0 ? pageHeightPx : 1,
          highlightRects: snap.highlightRects,
        });
      });
    };

    const onDocPointerUp = (e: PointerEvent) => {
      document.removeEventListener('pointermove', onDocPointerMove);
      document.removeEventListener('pointerup', onDocPointerUp);
      document.removeEventListener('pointercancel', onDocPointerCancel);
      finishSelection(e);
    };

    const onDocPointerCancel = () => {
      document.removeEventListener('pointermove', onDocPointerMove);
      document.removeEventListener('pointerup', onDocPointerUp);
      document.removeEventListener('pointercancel', onDocPointerCancel);
      releaseDragTouchLock();
      onLiveSelectionChange?.(null);
    };

    const onDocPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') {
        if (e.button !== 0) return;
      } else if (!textSelectionActive) {
        return;
      }

      let layer = (e.target as HTMLElement | null)?.closest('.textLayer');
      if (!(layer instanceof HTMLElement) || !isTextLayerSelectable(layer)) {
        for (const el of document.elementsFromPoint(e.clientX, e.clientY)) {
          const hit = el instanceof HTMLElement ? el.closest('.textLayer') : null;
          if (hit instanceof HTMLElement && isTextLayerSelectable(hit)) {
            layer = hit;
            break;
          }
        }
      }
      if (!(layer instanceof HTMLElement) || !isTextLayerSelectable(layer)) {
        return;
      }

      const pageRoot = pdfPageRootFromTextLayer(layer);
      if (!pageRoot) {
        return;
      }

      e.preventDefault();
      clearDocumentSelection();
      onLiveSelectionChange?.(null);

      if (e.pointerType !== 'mouse') {
        layer.style.touchAction = 'none';
        layer.style.webkitUserSelect = 'none';
        layer.style.setProperty('-webkit-touch-callout', 'none');
      }

      selectionDragRef.current = {
        textLayer: layer,
        pageRoot,
        startX: e.clientX,
        startY: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        pointerType: e.pointerType,
      };

      document.addEventListener('pointermove', onDocPointerMove);
      document.addEventListener('pointerup', onDocPointerUp);
      document.addEventListener('pointercancel', onDocPointerCancel);
    };

    root.addEventListener('pointerdown', onDocPointerDown);
    return () => {
      root.removeEventListener('pointerdown', onDocPointerDown);
      document.removeEventListener('pointermove', onDocPointerMove);
      document.removeEventListener('pointerup', onDocPointerUp);
      document.removeEventListener('pointercancel', onDocPointerCancel);
      releaseDragTouchLock();
      onLiveSelectionChange?.(null);
    };
  }, [
    containerRef,
    enableTextSelection,
    textSelectionActive,
    pdfReady,
    displayMode,
    onPromptChange,
    onLiveSelectionChange,
    selectionQuoteRef,
  ]);
}