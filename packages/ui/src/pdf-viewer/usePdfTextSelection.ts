import { useEffect, useRef } from 'react';
import {
  captureTextSelectionFromDrag,
  clearDocumentSelection,
  getTextFromCaretPoints,
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
  pdfReady: boolean;
  displayMode: string;
  url: string;
  onPromptChange: (prompt: PdfSelectionPrompt | null) => void;
  onLiveSelectionChange?: (selection: PdfLiveSelection | null) => void;
  selectionQuoteRef: React.MutableRefObject<string>;
};

export function usePdfTextSelection({
  containerRef,
  enableTextSelection,
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

    const finishMouseUp = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('[data-pdf-selection-ui]')) return;

      const drag = selectionDragRef.current;
      selectionDragRef.current = null;
      onLiveSelectionChange?.(null);

      const endX = drag?.lastX ?? e.clientX;
      const endY = drag?.lastY ?? e.clientY;

      requestAnimationFrame(() => {
        let snap: ReturnType<typeof readPdfTextSelection> = null;
        if (drag) {
          snap = captureTextSelectionFromDrag(drag, endX, endY);
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
          (drag ? pageNumberFromPageRoot(drag.pageRoot) : null) ?? pageNumberFromSelection(root);
        if (!pageNum) return;
        const pageRect = (drag?.pageRoot ?? pdfPageRootFromSelection(root))?.getBoundingClientRect();
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

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;

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
        selectionDragRef.current = null;
        onLiveSelectionChange?.(null);
        return;
      }

      const pageRoot = pdfPageRootFromTextLayer(layer);
      if (!pageRoot) {
        selectionDragRef.current = null;
        onLiveSelectionChange?.(null);
        return;
      }

      e.preventDefault();
      clearDocumentSelection();
      onLiveSelectionChange?.(null);

      selectionDragRef.current = {
        textLayer: layer,
        pageRoot,
        startX: e.clientX,
        startY: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
      };

      const onDocMouseMove = (moveEvent: MouseEvent) => {
        const drag = selectionDragRef.current;
        if (!drag) return;
        drag.lastX = moveEvent.clientX;
        drag.lastY = moveEvent.clientY;

        const preview = getTextFromCaretPoints(
          drag.startX,
          drag.startY,
          moveEvent.clientX,
          moveEvent.clientY,
          drag.textLayer,
          drag.pageRoot,
        );
        const page = pageNumberFromPageRoot(drag.pageRoot);
        if (preview && page) {
          onLiveSelectionChange?.({ page, highlightRects: preview.highlightRects });
        }
      };

      const onDocMouseUp = (upEvent: MouseEvent) => {
        document.removeEventListener('mousemove', onDocMouseMove);
        document.removeEventListener('mouseup', onDocMouseUp);
        finishMouseUp(upEvent);
      };

      document.addEventListener('mousemove', onDocMouseMove);
      document.addEventListener('mouseup', onDocMouseUp);
    };

    root.addEventListener('mousedown', onMouseDown);
    return () => {
      root.removeEventListener('mousedown', onMouseDown);
      selectionDragRef.current = null;
      onLiveSelectionChange?.(null);
    };
  }, [
    containerRef,
    enableTextSelection,
    pdfReady,
    displayMode,
    onPromptChange,
    onLiveSelectionChange,
    selectionQuoteRef,
  ]);
}
