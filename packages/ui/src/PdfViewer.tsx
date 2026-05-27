import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import * as pdfjs from 'pdfjs-dist';
import { searchPdfText, type PdfSearchMatch } from './pdf-search.js';

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
}: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<pdfjs.PDFDocumentProxy | null>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [containerWidth, setContainerWidth] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [internalPage, setInternalPage] = useState(1);
  const pageNum = page ?? internalPage;
  const [numPages, setNumPages] = useState(0);
  const [pdfReady, setPdfReady] = useState(false);
  const [visiblePages, setVisiblePages] = useState<Set<number>>(() => new Set([1]));
  const [searchMatches, setSearchMatches] = useState<PdfSearchMatch[]>([]);

  const goToPage = useCallback(
    (next: number) => {
      const clamped = Math.max(1, Math.min(numPages || next, next));
      if (onPageChange) onPageChange(clamped);
      else setInternalPage(clamped);
    },
    [numPages, onPageChange],
  );

  const computeScale = useCallback(
    (pageWidth: number) => {
      const fitScale = containerWidth > 0 ? containerWidth / pageWidth : 1;
      const base = clamp(fitScale, 0.2, 2.5);
      return zoomMode === 'custom' ? clamp(base * customScale, 0.2, 2.5) : base;
    },
    [containerWidth, zoomMode, customScale],
  );

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
    setNumPages(0);
    setSearchMatches([]);
    onSearchMatches?.([]);
    pdfRef.current = null;
    pageRefs.current.clear();
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
    if (match) goToPage(match.page);
  }, [activeMatchIndex, searchMatches, goToPage]);

  useEffect(() => {
    if (displayMode !== 'continuous' || !scrollRef.current) return;
    const el = pageRefs.current.get(pageNum);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
            if (entry.isIntersecting) next.add(p);
          }
          return next;
        });

        const visible = entries
          .filter((e) => e.isIntersecting)
          .map((e) => Number(e.target.getAttribute('data-page')))
          .filter((p) => p > 0)
          .sort((a, b) => a - b);

        if (visible.length > 0) {
          const center = visible[Math.floor(visible.length / 2)];
          if (center !== pageNum) goToPage(center);
        }
      },
      { root: scrollRef.current, rootMargin: '200px 0px', threshold: 0.01 },
    );

    for (const el of pageRefs.current.values()) observer.observe(el);
    return () => observer.disconnect();
  }, [displayMode, pdfReady, numPages, pageNum, goToPage]);

  const activeMatch = searchMatches[activeMatchIndex];

  return (
    <div ref={containerRef} className={['w-full', className].filter(Boolean).join(' ')}>
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
        />
      ) : (
        <div ref={scrollRef} className="max-h-[75vh] overflow-y-auto rounded-lg bg-slate-100 p-2">
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
                />
              ) : (
                <PagePlaceholder pageNumber={pageNumber} containerWidth={containerWidth} />
              )}
            </div>
          ))}
        </div>
      )}

      {numPages > 1 && (
        <div className="mt-4 flex justify-center">
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
}: {
  pdf: pdfjs.PDFDocumentProxy | null;
  pageNumber: number;
  containerWidth: number;
  computeScale: (pageWidth: number) => number;
  pdfReady: boolean;
  searchQuery: string;
  highlight: boolean;
  showLabel?: boolean;
}) {
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
  }, [pdf, pageNumber, containerWidth, computeScale, pdfReady, searchQuery, highlight]);

  return (
    <div ref={wrapperRef} className="relative inline-block rounded bg-white shadow-sm">
      {showLabel && (
        <span className="absolute -top-6 left-0 text-xs text-slate-500">Стр. {pageNumber}</span>
      )}
      <canvas ref={canvasRef} className="block" />
      <div
        ref={textLayerRef}
        className="textLayer pointer-events-none absolute inset-0 overflow-hidden opacity-30"
        aria-hidden
      />
      {pageError && <p className="p-2 text-xs text-red-600">{pageError}</p>}
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
