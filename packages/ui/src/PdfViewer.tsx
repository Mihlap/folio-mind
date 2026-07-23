import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { searchPdfText, type PdfSearchMatch } from './pdf-search.js';
import { PdfTextSelectionPrompt } from './PdfTextSelectionPrompt.js';
import { clearDocumentSelection } from './pdf-text-selection.js';
import type { PdfPageMarker } from './pdf-page-markers.js';
import { PageNavButton } from './pdf-viewer/PageNavButton.js';
import { PagePlaceholder } from './pdf-viewer/PagePlaceholder.js';
import { PdfViewerPage, type PdfViewerLayoutProps } from './pdf-viewer/PdfViewerPage.js';
import {
  usePdfTextSelection,
  type PdfLiveSelection,
  type PdfSelectionPrompt,
} from './pdf-viewer/usePdfTextSelection.js';
import { clamp, scrollPageWithinContainer } from './pdf-viewer/utils.js';
export type { PdfSearchMatch };
export type PdfViewerDisplayMode = 'single' | 'continuous';
export type PdfViewerZoomMode = 'fit-width' | 'custom';
type PdfViewerProps = {
  url?: string;
  pdfData?: Uint8Array;
  sourceKey?: string;
  httpHeaders?: Record<string, string>;
  onDocumentLoad?: () => void;
  onDocumentLoadError?: (message: string) => void;
  onDocumentPagesLoad?: (numPages: number) => void;
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
  onTextQuoteForEdit?: (payload: {
    text: string;
    page: number;
    x?: number;
    y?: number;
    pageWidthPx?: number;
    pageHeightPx?: number;
  }) => void;
  surfaceTone?: 'light' | 'dark';
  showPageNav?: boolean;
} & PdfViewerLayoutProps;
export function PdfViewer({
  url,
  pdfData,
  sourceKey,
  httpHeaders,
  onDocumentLoad,
  onDocumentLoadError,
  onDocumentPagesLoad,
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
  pageLayoutCountByPage = {},
  onPageLayoutOpen,
  pageNavTick = 0,
  enableTextSelection = false,
  onTextQuoteForEdit,
  enabled: layoutEnabled = false,
  objects: layoutObjects = [],
  selectedObjectId = null,
  showGrid = true,
  showRulers = true,
  gridStepMm = 10,
  snapEnabled = false,
  cropMode = false,
  showPageGuides = false,
  marginPresetId = 'none',
  onLayoutObjectSelect,
  onLayoutObjectChange,
  onLayoutObjectCropChange,
  onLayoutFilesDrop,
  onLayoutMediaAssetDrop,
  surfaceTone = 'light',
  showPageNav = true,
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
  const [selectionPrompt, setSelectionPrompt] = useState<PdfSelectionPrompt | null>(null);
  const [liveSelection, setLiveSelection] = useState<PdfLiveSelection | null>(null);
  const [referencePageSizePt, setReferencePageSizePt] = useState({ width: 595, height: 842 });
  const selectionQuoteRef = useRef<string>('');
  const layoutMaxPage = useMemo(() => {
    let max = 0;
    for (const object of layoutObjects) max = Math.max(max, Number(object.page) || 0);
    return max;
  }, [layoutObjects]);
  const displayPageCount = Math.max(numPages, layoutEnabled ? layoutMaxPage : 0);
  const goToPage = useCallback(
    (next: number, source: 'external' | 'observer' = 'external') => {
      const maxPage = displayPageCount || next;
      const clamped = Math.max(1, Math.min(maxPage, next));
      lastPageUpdateSourceRef.current = source;
      if (onPageChange) onPageChange(clamped);
      else setInternalPage(clamped);
    },
    [displayPageCount, onPageChange],
  );
  const computeScale = useCallback(
    (pageWidth: number) => {
      const fitScale = containerWidth > 0 ? ((containerWidth - 6) / pageWidth) * 0.995 : 1;
      const base = clamp(fitScale, 0.2, 2.5);
      return zoomMode === 'custom' ? clamp(base * customScale, 0.2, 2.5) : base;
    },
    [containerWidth, zoomMode, customScale],
  );
  const handlePromptChange = useCallback((prompt: PdfSelectionPrompt | null) => {
    setSelectionPrompt(prompt);
  }, []);
  const handleLiveSelectionChange = useCallback((selection: PdfLiveSelection | null) => {
    setLiveSelection(selection);
  }, []);
  usePdfTextSelection({
    containerRef,
    enableTextSelection,
    pdfReady,
    displayMode,
    url: sourceKey ?? url ?? '',
    onPromptChange: handlePromptChange,
    onLiveSelectionChange: handleLiveSelectionChange,
    selectionQuoteRef,
  });
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
    if (!pdfData && !url) return;
    let cancelled = false;
    const loadingTask = pdfjs.getDocument(
      pdfData
        ? { data: pdfData.slice() }
        : {
            url: url!,
            httpHeaders,
            withCredentials: false,
          },
    );
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
        onDocumentPagesLoad?.(pdf.numPages);
        void pdf.getPage(1).then((firstPage) => {
          if (cancelled) return;
          const viewport = firstPage.getViewport({ scale: 1 });
          setReferencePageSizePt({ width: viewport.width, height: viewport.height });
        });
        setPdfReady(true);
        onDocumentLoad?.();
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Failed to load PDF';
          setError(message);
          onDocumentLoadError?.(message);
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
  }, [url, pdfData, httpHeaders, onPageChange, onSearchMatches, onDocumentLoad, onDocumentLoadError, onDocumentPagesLoad]);
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
      scrollPageWithinContainer(scrollRef.current, el);
    }
  }, [pageNum, displayMode]);
  useEffect(() => {
    if (displayMode !== 'continuous' || !scrollRef.current || pageNavTick === 0) return;
    const el = pageRefs.current.get(pageNum);
    if (!el) return;
    lastPageUpdateSourceRef.current = 'external';
    suppressObserverUntilRef.current = Date.now() + 900;
    scrollPageWithinContainer(scrollRef.current, el);
  }, [pageNavTick, displayMode, pageNum]);
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
  }, [displayMode, pdfReady, displayPageCount, pageNum, goToPage]);
  const activeMatch = searchMatches[activeMatchIndex];
  const showTextLayerOnPages = Boolean(searchQuery.trim()) || enableTextSelection;
  const selectionForPage = (pageNumber: number) => {
    if (liveSelection?.page === pageNumber) return liveSelection.highlightRects;
    if (selectionPrompt?.page === pageNumber) return selectionPrompt.highlightRects;
    return undefined;
  };
  const layoutObjectPages = useMemo(() => {
    const pages = new Set<number>();
    for (const object of layoutObjects) pages.add(Number(object.page));
    return pages;
  }, [layoutObjects]);
  const shouldRenderPage = useCallback(
    (pageNumber: number) =>
      visiblePages.has(pageNumber) ||
      Math.abs(pageNumber - pageNum) <= 2 ||
      layoutObjectPages.has(pageNumber),
    [layoutObjectPages, pageNum, visiblePages],
  );
  const pageProps = {
    pdf: pdfRef.current,
    pdfPageCount: numPages,
    referencePageSizePt,
    containerWidth,
    computeScale,
    pdfReady,
    searchQuery,
    showTextLayer: showTextLayerOnPages,
    enableTextSelection,
    pageMarkers,
    activeMarkerId,
    onMarkerClick,
    onMarkersOverflowClick,
    pageAcceptedEditCountByPage,
    onPageAcceptedEditsOpen,
    pageLayoutCountByPage,
    onPageLayoutOpen,
    enabled: layoutEnabled,
    objects: layoutObjects,
    selectedObjectId,
    showGrid,
    showRulers,
    gridStepMm,
    snapEnabled,
    cropMode,
    showPageGuides,
    marginPresetId,
    onLayoutObjectSelect,
    onLayoutObjectChange,
    onLayoutObjectCropChange,
    onLayoutFilesDrop,
    onLayoutMediaAssetDrop,
  };
  const surfaceClass = surfaceTone === 'dark' ? 'bg-black' : 'bg-slate-100';
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
            onTextQuoteForEdit?.({
              text,
              page: selectionPrompt.page,
              x,
              y,
              pageWidthPx: selectionPrompt.pageWidthPx,
              pageHeightPx: selectionPrompt.pageHeightPx,
            });
            setSelectionPrompt(null);
            selectionQuoteRef.current = '';
            clearDocumentSelection();
          }}
        />
      )}
      {error ? (
        <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</p>
      ) : displayMode === 'single' ? (
        <div
          className={`scrollbar-thin flex min-h-0 flex-1 justify-center overflow-auto rounded-lg ${surfaceClass} ${surfaceTone === 'dark' ? 'p-1' : 'p-2'}`}
        >
          <PdfViewerPage
            key={pageNum}
            {...pageProps}
            pageNumber={pageNum}
            highlight={activeMatch?.page === pageNum}
            selectionHighlightRects={selectionForPage(pageNum)}
          />
        </div>
      ) : (
        <div
          ref={scrollRef}
          className={`scrollbar-thin min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain rounded-lg ${surfaceClass} ${surfaceTone === 'dark' ? 'p-1' : 'p-2'}`}
        >
          {Array.from({ length: displayPageCount }, (_, i) => i + 1).map((pageNumber) => (
            <div
              key={pageNumber}
              ref={(el) => {
                if (el) pageRefs.current.set(pageNumber, el);
                else pageRefs.current.delete(pageNumber);
              }}
              data-page={pageNumber}
              className="mb-4 flex justify-center last:mb-0"
            >
              {shouldRenderPage(pageNumber) ? (
                <PdfViewerPage
                  {...pageProps}
                  pageNumber={pageNumber}
                  highlight={activeMatch?.page === pageNumber}
                  showLabel={displayPageCount > 1}
                  selectionHighlightRects={selectionForPage(pageNumber)}
                />
              ) : (
                <PagePlaceholder pageNumber={pageNumber} containerWidth={containerWidth} />
              )}
            </div>
          ))}
        </div>
      )}

      {displayPageCount > 1 && showPageNav && (
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
              {pageNum} / {displayPageCount}
            </span>
            <PageNavButton
              label="Следующая страница"
              disabled={pageNum >= displayPageCount}
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
