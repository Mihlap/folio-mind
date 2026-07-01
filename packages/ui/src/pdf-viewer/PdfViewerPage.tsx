import { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import { PdfAcceptedEditsHint } from '../PdfAcceptedEditsHint.js';
import { PdfTextSelectionHighlight } from '../PdfTextSelectionHighlight.js';
import type { PdfSelectionHighlightRect } from '../PdfTextSelectionHighlight.js';
import { markersForPage, type PdfPageMarker } from '../pdf-page-markers.js';
import { PageMarkersOverlay } from './PageMarkersOverlay.js';
import { highlightTextLayer, isRenderCancelled } from './utils.js';
export type PdfViewerPageProps = {
  pdf: pdfjs.PDFDocumentProxy | null;
  pageNumber: number;
  containerWidth: number;
  computeScale: (pageWidth: number) => number;
  pdfReady: boolean;
  searchQuery: string;
  highlight: boolean;
  showLabel?: boolean;
  showTextLayer?: boolean;
  enableTextSelection?: boolean;
  pageMarkers?: PdfPageMarker[];
  activeMarkerId?: string | null;
  onMarkerClick?: (marker: PdfPageMarker) => void;
  onMarkersOverflowClick?: (page: number) => void;
  pageAcceptedEditCountByPage?: Record<number, number>;
  onPageAcceptedEditsOpen?: (page: number) => void;
  selectionHighlightRects?: PdfSelectionHighlightRect[];
};
export function PdfViewerPage({
  pdf,
  pageNumber,
  containerWidth,
  computeScale,
  pdfReady,
  searchQuery,
  highlight,
  showLabel,
  showTextLayer,
  enableTextSelection = false,
  pageMarkers = [],
  activeMarkerId,
  onMarkerClick,
  onMarkersOverflowClick,
  pageAcceptedEditCountByPage = {},
  onPageAcceptedEditsOpen,
  selectionHighlightRects,
}: PdfViewerPageProps) {
  const markersOnPage = markersForPage(pageMarkers, pageNumber).filter(
    (m) => m.kind !== 'accepted_edit',
  );
  const acceptedEditCount = pageAcceptedEditCountByPage[pageNumber] ?? 0;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const textLayer = textLayerRef.current;
    if (!canvas || !textLayer || !pdf || !pdfReady) return;
    let cancelled = false;
    let renderTask: pdfjs.RenderTask | null = null;
    setPageError(null);
    textLayer.replaceChildren();
    void (async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        if (cancelled) return;
        const baseViewport = page.getViewport({ scale: 1 });
        const cssScale = computeScale(baseViewport.width);
        const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
        const viewport = page.getViewport({ scale: cssScale * dpr });
        const context = canvas.getContext('2d');
        if (!context || cancelled) return;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${baseViewport.width * cssScale}px`;
        canvas.style.height = `${baseViewport.height * cssScale}px`;
        textLayer.style.width = canvas.style.width;
        textLayer.style.height = canvas.style.height;
        renderTask = page.render({
          canvasContext: context,
          viewport,
          canvas,
        } as Parameters<typeof page.render>[0]);
        await renderTask.promise;
        if (cancelled) return;
        if (showTextLayer) {
          const textContent = await page.getTextContent();
          const textLayerInstance = new pdfjs.TextLayer({
            textContentSource: textContent,
            container: textLayer,
            viewport: page.getViewport({ scale: cssScale }),
          });
          await textLayerInstance.render();
          if (searchQuery.trim()) {
            highlightTextLayer(textLayer, searchQuery.trim());
          }
        }
        if (highlight) {
          wrapperRef.current?.classList.add('ring-2', 'ring-amber-400');
        } else {
          wrapperRef.current?.classList.remove('ring-2', 'ring-amber-400');
        }
      } catch (err) {
        if (cancelled || isRenderCancelled(err)) return;
        setPageError(err instanceof Error ? err.message : 'Ошибка рендера страницы');
      }
    })();
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [
    pdf,
    pageNumber,
    containerWidth,
    computeScale,
    pdfReady,
    searchQuery,
    highlight,
    showTextLayer,
  ]);
  const quoteSelectMode = Boolean(enableTextSelection && showTextLayer && !searchQuery.trim());
  return (
    <div
      ref={wrapperRef}
      data-pdf-page={pageNumber}
      className="pdf-page-root relative inline-block rounded bg-white shadow-sm"
    >
      {showLabel && (
        <span className="pointer-events-none absolute left-2 top-2 z-10 rounded bg-white/90 px-1.5 py-0.5 text-xs font-medium text-slate-600 shadow-sm">
          Стр. {pageNumber}
        </span>
      )}
      <canvas ref={canvasRef} className="block" />
      <div
        ref={textLayerRef}
        className={[
          'textLayer absolute inset-0 overflow-hidden',
          showTextLayer
            ? searchQuery.trim()
              ? 'opacity-30'
              : quoteSelectMode
                ? 'textLayer--quote'
                : 'opacity-0'
            : 'opacity-0',
          enableTextSelection && showTextLayer
            ? 'pointer-events-auto select-text'
            : 'pointer-events-none',
        ].join(' ')}
        aria-hidden={!enableTextSelection}
      />
      {selectionHighlightRects && selectionHighlightRects.length > 0 && (
        <PdfTextSelectionHighlight rects={selectionHighlightRects} />
      )}
      {(acceptedEditCount > 0 || markersOnPage.length > 0) && (
        <>
          {acceptedEditCount > 0 && onPageAcceptedEditsOpen && (
            <div className="pointer-events-none absolute top-2 right-2 z-10">
              <PdfAcceptedEditsHint
                count={acceptedEditCount}
                onClick={() => onPageAcceptedEditsOpen(pageNumber)}
              />
            </div>
          )}
          {markersOnPage.length > 0 && (
            <PageMarkersOverlay
              pageNumber={pageNumber}
              markers={markersOnPage}
              activeMarkerId={activeMarkerId}
              onMarkerClick={onMarkerClick}
              onOverflowClick={onMarkersOverflowClick}
            />
          )}
        </>
      )}
      {pageError && <p className="p-2 text-xs text-red-600">{pageError}</p>}
    </div>
  );
}
