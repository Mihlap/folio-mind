import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import * as pdfjs from 'pdfjs-dist';
import { searchPdfText, type PdfSearchMatch } from './pdf-search.js';
import { PdfAcceptedEditsHint } from './PdfAcceptedEditsHint.js';
import { PdfTextSelectionHighlight } from './PdfTextSelectionHighlight.js';
import type { PdfSelectionHighlightRect } from './PdfTextSelectionHighlight.js';
import { PdfTextSelectionPrompt } from './PdfTextSelectionPrompt.js';
import {
  captureTextSelectionFromDrag,
  clearDocumentSelection,
  isTextLayerSelectable,
  pageNumberFromPageRoot,
  pageNumberFromSelection,
  pdfPageRootFromTextLayer,
  readPdfTextSelection,
  type PdfTextSelectionDrag,
} from './pdf-text-selection.js';
import {
  markerKindClass,
  markersForPage,
  type PdfPageMarker,
} from './pdf-page-markers.js';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

export type { PdfSearchMatch };

export type PdfViewerDisplayMode = 'single' | 'continuous';
export type PdfViewerZoomMode = 'fit-width' | 'custom';

type PdfViewerProps = {
  url: string;
  className?: string;
  page?: number;
  onPageChange?: (page: number) => void;
  displayMode?: PdfViewerDisplayMode;
  zoomMode?: PdfViewerZoomMode;
  customScale?: number;
  searchQuery?: string;
  activeMatchIndex?: number;
  onSearchMatches?: (matches: PdfSearchMatch[]) => void;  
  pageMarkers?: PdfPageMarker[];
  activeMarkerId?: string | null;
  onMarkerClick?: (marker: PdfPageMarker) => void;
  pageAcceptedEditCountByPage?: Record<number, number>;
  onPageAcceptedEditsOpen?: (page: number) => void;
  onMarkersOverflowClick?: (page: number) => void;
  pageNavTick?: number;

  enableTextSelection?: boolean;
  onTextQuoteForEdit?: (payload: { text: string; page: number; x?: number; y?: number }) => void;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function isRenderCancelled(err: unknown) {
  return (
    err instanceof Error &&
    (err.name === 'RenderingCancelledException' || err.message.includes('cancelled'))
  );
}

export function PdfViewer({
  url,
  className,
  page,
  onPageChange,
  displayMode = 'continuous',
  zoomMode = 'fit-width',
  customScale = 1,
  searchQuery = '',
  activeMatchIndex = 0,
  onSearchMatches,
  pageMarkers = [],
  activeMarkerId = null,
  onMarkerClick,
  pageAcceptedEditCountByPage = {},
  onPageAcceptedEditsOpen,
  onMarkersOverflowClick,
  pageNavTick = 0,
  enableTextSelection = false,
  onTextQuoteForEdit,
}: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<pdfjs.PDFDocumentProxy | null>(null);
  const suppressObserverUntilRef = useRef(0);
  const lastPageUpdateSourceRef = useRef<'external' | 'observer'>('external');
  const visibilityRatioRef = useRef<Map<number, number>>(new Map());
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [containerWidth, setContainerWidth] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [internalPage, setInternalPage] = useState(1);
  const pageNum = page ?? internalPage;
  const [numPages, setNumPages] = useState(0);
  const [pdfReady, setPdfReady] = useState(false);
  const [visiblePages, setVisiblePages] = useState<Set<number>>(() => new Set([1]));
  const [searchMatches, setSearchMatches] = useState<PdfSearchMatch[]>([]);
  const [selectionPrompt, setSelectionPrompt] = useState<{
    text: string;
    page: number;
    x: number;
    y: number;
    highlightRects: PdfSelectionHighlightRect[];
  } | null>(null);
  const selectionDragRef = useRef<PdfTextSelectionDrag | null>(null);
  const selectionQuoteRef = useRef<string>('');

  const goToPage = useCallback(
    (next: number, source: 'external' | 'observer' = 'external') => {
      const clamped = Math.max(1, Math.min(numPages || next, next));
      lastPageUpdateSourceRef.current = source;
      if (onPageChange) onPageChange(clamped);
      else setInternalPage(clamped);
    },
    [numPages, onPageChange],
  );

  const computeScale = useCallback(
    (pageWidth: number) => {
      const fitScale = containerWidth > 0 ? ((containerWidth - 6) / pageWidth) * 0.995 : 1;
      const base = clamp(fitScale, 0.2, 2.5);
      return zoomMode === 'custom' ? clamp(base * customScale, 0.2, 2.5) : base;
    },
    [containerWidth, zoomMode, customScale],
  );

  useEffect(() => {
    if (page === undefined) return;
    lastPageUpdateSourceRef.current = 'external';
  }, [page]);

  useEffect(() => {
    setSelectionPrompt(null);
  }, [url, enableTextSelection]);

  useEffect(() => {
    if (!enableTextSelection) return;
    const root = containerRef.current;
    if (!root) return;

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
        return;
      }
      const pageRoot = pdfPageRootFromTextLayer(layer);
      if (!pageRoot) {
        selectionDragRef.current = null;
        return;
      }
      selectionDragRef.current = {
        textLayer: layer,
        pageRoot,
        startX: e.clientX,
        startY: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
      };
    };

    const onMouseMove = (e: MouseEvent) => {
      const drag = selectionDragRef.current;
      if (!drag) return;
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
    };

    const onMouseUp = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('[data-pdf-selection-ui]')) return;

      const drag = selectionDragRef.current;
      selectionDragRef.current = null;
      const endX = drag?.lastX ?? e.clientX;
      const endY = drag?.lastY ?? e.clientY;

      requestAnimationFrame(() => {
        let snap = readPdfTextSelection(root);
        if (!snap && drag) {
          snap = captureTextSelectionFromDrag(drag, endX, endY);
        }
        clearDocumentSelection();

        if (!snap) {
          setSelectionPrompt(null);
          selectionQuoteRef.current = '';
          return;
        }

        const pageNum =
          (drag ? pageNumberFromPageRoot(drag.pageRoot) : null) ?? pageNumberFromSelection(root);
        if (!pageNum) return;

        const anchorX =
          snap.rect.width > 0 || snap.rect.left > 0 ? snap.rect.left : endX;
        const anchorY =
          snap.rect.height > 0 || snap.rect.bottom > 0
            ? snap.rect.bottom + 6
            : endY + 6;

        selectionQuoteRef.current = snap.text;
        setSelectionPrompt({
          text: snap.text,
          page: pageNum,
          x: anchorX,
          y: anchorY,
          highlightRects: snap.highlightRects,
        });
      });
    };

    root.addEventListener('mousedown', onMouseDown);
    root.addEventListener('mousemove', onMouseMove);
    root.addEventListener('mouseup', onMouseUp);
    return () => {
      root.removeEventListener('mousedown', onMouseDown);
      root.removeEventListener('mousemove', onMouseMove);
      root.removeEventListener('mouseup', onMouseUp);
    };
  }, [enableTextSelection, pdfReady, displayMode]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      setContainerWidth((prev) => (Math.abs(prev - w) < 8 ? prev : w));
    });
    ro.observe(el);
    setContainerWidth(el.clientWidth);

    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadingTask = pdfjs.getDocument({ url });

    setError(null);
    setPdfReady(false);
    setInternalPage(1);
    onPageChange?.(1);
    suppressObserverUntilRef.current = Date.now() + 1200;
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setNumPages(0);
    setSearchMatches([]);
    onSearchMatches?.([]);
    pdfRef.current = null;
    pageRefs.current.clear();
    visibilityRatioRef.current.clear();
    setVisiblePages(new Set([1]));

    void loadingTask.promise
      .then((pdf) => {
        if (cancelled) {
          void pdf.destroy();
          return;
        }
        pdfRef.current = pdf;
        setNumPages(pdf.numPages);
        setPdfReady(true);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load PDF');
        }
      });

    return () => {
      cancelled = true;
      void loadingTask.destroy();
      if (pdfRef.current) {
        void pdfRef.current.destroy();
        pdfRef.current = null;
      }
    };
  }, [url]);

  useEffect(() => {
    const pdf = pdfRef.current;
    if (!pdf || !pdfReady) return;

    let cancelled = false;
    void searchPdfText(pdf, searchQuery).then((matches) => {
      if (cancelled) return;
      setSearchMatches(matches);
      onSearchMatches?.(matches);
    });

    return () => {
      cancelled = true;
    };
  }, [pdfReady, searchQuery, url, onSearchMatches]);

  useEffect(() => {
    if (searchMatches.length === 0) return;
    const match = searchMatches[activeMatchIndex];
    if (match) {
      suppressObserverUntilRef.current = Date.now() + 1800;
      goToPage(match.page, 'external');
    }
  }, [activeMatchIndex, searchMatches, goToPage]);

  useEffect(() => {
    if (displayMode !== 'continuous' || !scrollRef.current) return;
    if (lastPageUpdateSourceRef.current === 'observer') return;
    const el = pageRefs.current.get(pageNum);
    if (el) {
      suppressObserverUntilRef.current = Date.now() + 900;
      el.scrollIntoView({ behavior: 'auto', block: 'start' });
    }
  }, [pageNum, displayMode]);

  useEffect(() => {
    if (displayMode !== 'continuous' || !scrollRef.current || !pdfReady) return;

    const observer = new IntersectionObserver(
      (entries) => {
        setVisiblePages((prev) => {
          const next = new Set(prev);
          for (const entry of entries) {
            const pageAttr = entry.target.getAttribute('data-page');
            const p = pageAttr ? Number(pageAttr) : 0;
            if (!p) continue;
            if (entry.isIntersecting) {
              next.add(p);
              visibilityRatioRef.current.set(p, entry.intersectionRatio);
            } else {
              visibilityRatioRef.current.delete(p);
              next.delete(p);
            }
          }
          return next;
        });

        const visible = Array.from(visibilityRatioRef.current.entries())
          .map(([pageValue, ratio]) => ({ page: pageValue, ratio }))
          .sort((a, b) => b.ratio - a.ratio);

        if (visible.length > 0) {
          if (Date.now() < suppressObserverUntilRef.current) return;
          const preferred = visible.find((item) => item.ratio >= 0.2);
          const mostVisiblePage = (preferred ?? visible[0])?.page;
          if (mostVisiblePage && mostVisiblePage !== pageNum) goToPage(mostVisiblePage, 'observer');
        }
      },
      { root: scrollRef.current, rootMargin: '0px', threshold: [0.01, 0.15, 0.35, 0.55, 0.75] },
    );

    for (const el of pageRefs.current.values()) observer.observe(el);
    return () => observer.disconnect();
  }, [displayMode, pdfReady, numPages, pageNum, goToPage]);

  const activeMatch = searchMatches[activeMatchIndex];

  const showTextLayerOnPages = Boolean(searchQuery.trim()) || enableTextSelection;

  return (
    <div
      ref={containerRef}
      className={['flex min-h-0 w-full flex-col', className].filter(Boolean).join(' ')}
    >
      {selectionPrompt && enableTextSelection && (
        <PdfTextSelectionPrompt
          x={selectionPrompt.x}
          y={selectionPrompt.y}
          previewText={selectionPrompt.text}
          onDismiss={() => {
            setSelectionPrompt(null);
            selectionQuoteRef.current = '';
            clearDocumentSelection();
          }}
          onUseAsQuote={() => {
            const text = selectionQuoteRef.current || selectionPrompt.text;
            const rects = selectionPrompt.highlightRects;
            let x: number | undefined;
            let y: number | undefined;
            if (rects.length > 0) {
              const avgLeft = rects.reduce((s, r) => s + r.left, 0) / rects.length;
              const avgTop = rects.reduce((s, r) => s + r.top, 0) / rects.length;
              x = avgLeft;
              y = avgTop;
            }
            onTextQuoteForEdit?.({ text, page: selectionPrompt.page, x, y });
            setSelectionPrompt(null);
            selectionQuoteRef.current = '';
            clearDocumentSelection();
          }}
        />
      )}
      {error ? (
        <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</p>
      ) : displayMode === 'single' ? (
        <PdfPage
          pdf={pdfRef.current}
          pageNumber={pageNum}
          containerWidth={containerWidth}
          computeScale={computeScale}
          pdfReady={pdfReady}
          searchQuery={searchQuery}
          highlight={activeMatch?.page === pageNum}
          showTextLayer={showTextLayerOnPages}
          enableTextSelection={enableTextSelection}
          pageMarkers={pageMarkers}
          activeMarkerId={activeMarkerId}
          onMarkerClick={onMarkerClick}
          onMarkersOverflowClick={onMarkersOverflowClick}
          pageAcceptedEditCountByPage={pageAcceptedEditCountByPage}
          onPageAcceptedEditsOpen={onPageAcceptedEditsOpen}
          selectionHighlightRects={
            selectionPrompt?.page === pageNum ? selectionPrompt.highlightRects : undefined
          }
        />
      ) : (
        <div
          ref={scrollRef}
          className="scrollbar-thin min-h-0 flex-1 overflow-x-hidden overflow-y-auto rounded-lg bg-slate-100 p-2"
        >
          {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNumber) => (
            <div
              key={pageNumber}
              ref={(el) => {
                if (el) pageRefs.current.set(pageNumber, el);
                else pageRefs.current.delete(pageNumber);
              }}
              data-page={pageNumber}
              className="mb-4 flex justify-center last:mb-0"
            >
              {visiblePages.has(pageNumber) || Math.abs(pageNumber - pageNum) <= 2 ? (
                <PdfPage
                  pdf={pdfRef.current}
                  pageNumber={pageNumber}
                  containerWidth={containerWidth}
                  computeScale={computeScale}
                  pdfReady={pdfReady}
                  searchQuery={searchQuery}
                  highlight={activeMatch?.page === pageNumber}
                  showLabel={numPages > 1}
                  showTextLayer={showTextLayerOnPages}
                  enableTextSelection={enableTextSelection}
                  pageMarkers={pageMarkers}
                  activeMarkerId={activeMarkerId}
                  onMarkerClick={onMarkerClick}
                  onMarkersOverflowClick={onMarkersOverflowClick}
                  pageAcceptedEditCountByPage={pageAcceptedEditCountByPage}
                  onPageAcceptedEditsOpen={onPageAcceptedEditsOpen}
                  selectionHighlightRects={
                    selectionPrompt?.page === pageNumber
                      ? selectionPrompt.highlightRects
                      : undefined
                  }
                />
              ) : (
                <PagePlaceholder pageNumber={pageNumber} containerWidth={containerWidth} />
              )}
            </div>
          ))}
        </div>
      )}

      {numPages > 1 && (
        <div className="mt-4 flex shrink-0 justify-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-sm">
            <PageNavButton
              label="Предыдущая страница"
              disabled={pageNum <= 1}
              onClick={() => goToPage(pageNum - 1)}
            >
              ‹
            </PageNavButton>
            <span className="min-w-[4.5rem] text-center text-sm font-medium tabular-nums text-slate-700">
              {pageNum} / {numPages}
            </span>
            <PageNavButton
              label="Следующая страница"
              disabled={pageNum >= numPages}
              onClick={() => goToPage(pageNum + 1)}
            >
              ›
            </PageNavButton>
          </div>
        </div>
      )}
    </div>
  );
}

function PagePlaceholder({
  pageNumber,
  containerWidth,
}: {
  pageNumber: number;
  containerWidth: number;
}) {
  const height = Math.round(containerWidth * 1.414) || 800;
  return (
    <div
      className="flex w-full items-center justify-center rounded bg-white text-sm text-slate-400 shadow-sm"
      style={{ maxWidth: containerWidth || '100%', height }}
    >
      Страница {pageNumber}
    </div>
  );
}

function PdfPage({
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
}: {
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
}) {
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
    if (!canvas || !textLayer || !pdf || !pdfReady || !containerWidth) return;

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

        renderTask = page.render({ canvasContext: context, viewport });
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
  }, [pdf, pageNumber, containerWidth, computeScale, pdfReady, searchQuery, highlight, showTextLayer]);

  const quoteSelectMode = Boolean(enableTextSelection && showTextLayer && !searchQuery.trim());

  return (
    <div
      ref={wrapperRef}
      data-pdf-page={pageNumber}
      className="pdf-page-root relative inline-block rounded bg-white shadow-sm"
    >
      {showLabel && (
        <span className="absolute -top-6 left-0 text-xs text-slate-500">Стр. {pageNumber}</span>
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

function PageMarkersOverlay({
  pageNumber,
  markers,
  activeMarkerId,
  onMarkerClick,
  onOverflowClick,
}: {
  pageNumber: number;
  markers: PdfPageMarker[];
  activeMarkerId?: string | null;
  onMarkerClick?: (marker: PdfPageMarker) => void;
  onOverflowClick?: (page: number) => void;
}) {
  const maxVisible = 3;
  const positioned = markers.filter((m) => m.x != null && m.y != null);
  const unpositioned = markers.filter((m) => m.x == null || m.y == null);
  const visible = unpositioned.slice(0, maxVisible);
  const overflow = markers.length - visible.length - positioned.length;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden" aria-label="Заметки на странице">
      {positioned.map((marker) => {
        const active = marker.id === activeMarkerId;
        return (
          <button
            key={marker.id}
            type="button"
            title={marker.title}
            onClick={() => onMarkerClick?.(marker)}
            className={[
              'pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full px-1.5 py-0.5 text-left shadow-sm ring-2 transition',
              markerKindClass(marker.kind),
              active ? 'scale-110 ring-2 ring-white animate-pulse z-20' : 'ring-transparent z-10',
            ].join(' ')}
            style={{ left: `${marker.x!}px`, top: `${marker.y!}px` }}
          >
            <span className="h-2 w-2 shrink-0 rounded-full bg-white/90" aria-hidden />
          </button>
        );
      })}
      {unpositioned.length > 0 && (
        <div className="pointer-events-auto absolute top-2 right-2 flex max-w-[min(52%,15rem)] flex-col items-end gap-1.5">
          {visible.map((marker) => {
            const active = marker.id === activeMarkerId;
            return (
              <button
                key={marker.id}
                type="button"
                title={marker.title}
                onClick={() => onMarkerClick?.(marker)}
                className={[
                  'flex max-w-full cursor-pointer items-center gap-1 rounded-full px-1.5 py-0.5 text-left shadow-sm ring-2 transition',
                  markerKindClass(marker.kind),
                  active ? 'scale-110 ring-2 ring-white animate-pulse' : 'ring-transparent',
                ].join(' ')}
              >
                <span className="h-2 w-2 shrink-0 rounded-full bg-white/90" aria-hidden />
                <span className="truncate text-[10px] font-medium leading-tight text-white">
                  {marker.title}
                </span>
              </button>
            );
          })}
          {overflow > 0 && (
            <button
              type="button"
              title={`Ещё ${overflow + positioned.length} заметок на стр. ${pageNumber}`}
              onClick={() => onOverflowClick?.(pageNumber)}
              className="cursor-pointer rounded-full border border-slate-200 bg-white/95 px-2.5 py-1 text-[10px] font-medium text-slate-700 shadow-sm ring-1 ring-white/90 hover:border-slate-300 hover:bg-slate-50"
            >
              +{overflow + positioned.length} заметок
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function highlightTextLayer(container: HTMLDivElement, query: string) {
  const lower = query.toLowerCase();
  for (const span of container.querySelectorAll('span')) {
    const text = span.textContent ?? '';
    const idx = text.toLowerCase().indexOf(lower);
    if (idx === -1) continue;
    const before = text.slice(0, idx);
    const match = text.slice(idx, idx + query.length);
    const after = text.slice(idx + query.length);
    span.textContent = '';
    if (before) span.append(document.createTextNode(before));
    const mark = document.createElement('mark');
    mark.className = 'bg-yellow-300 text-inherit';
    mark.textContent = match;
    span.append(mark);
    if (after) span.append(document.createTextNode(after));
  }
}

function PageNavButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-xl leading-none text-slate-700 transition hover:border-folio-300 hover:bg-folio-50 hover:text-folio-700 disabled:cursor-not-allowed disabled:border-slate-100 disabled:bg-transparent disabled:text-slate-300"
    >
      {children}
    </button>
  );
}
