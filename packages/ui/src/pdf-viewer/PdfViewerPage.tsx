import { useEffect, useRef, useState, type DragEvent } from 'react';
import * as pdfjs from 'pdfjs-dist';
import { PdfAcceptedEditsHint } from '../PdfAcceptedEditsHint.js';
import { PdfLayoutObjectsHint } from '../PdfLayoutObjectsHint.js';
import { PdfTextSelectionHighlight } from '../PdfTextSelectionHighlight.js';
import type { PdfSelectionHighlightRect } from '../PdfTextSelectionHighlight.js';
import { markersForPage, type PdfPageMarker } from '../pdf-page-markers.js';
import { PageMarkersOverlay } from './PageMarkersOverlay.js';
import { PdfLayoutPageShell } from '../layout-editor/PdfLayoutPageShell.js';
import { PdfLayoutGrid } from '../layout-editor/PdfLayoutGrid.js';
import { PdfLayoutMarginsOverlay } from '../layout-editor/PdfLayoutMarginsOverlay.js';
import { PdfLayoutObjectsOverlay } from '../layout-editor/PdfLayoutObjectsOverlay.js';
import { PdfLayoutShapesOverlay } from '../layout-editor/PdfLayoutShapesOverlay.js';
import type { LayoutImageObject, LayoutMarginPresetId, LayoutPageObject, LayoutRect } from '@folio-mind/pdf-contracts';
import { highlightTextLayer, isRenderCancelled } from './utils.js';
import { pdfPointsToMm, layoutStepFraction, layoutGuidesForPreset, isLayoutImageObject, isLayoutShapeObject, FOLIO_MEDIA_DRAG_MIME, parseFolioMediaDragPayload } from '@folio-mind/pdf-contracts';

export type PdfViewerLayoutProps = {
  enabled?: boolean;
  objects?: LayoutPageObject[];
  selectedObjectId?: string | null;
  showGrid?: boolean;
  showRulers?: boolean;
  gridStepMm?: number;
  snapEnabled?: boolean;
  cropMode?: boolean;
  showPageGuides?: boolean;
  marginPresetId?: LayoutMarginPresetId;
  onLayoutObjectSelect?: (id: string | null) => void;
  onLayoutObjectChange?: (id: string, rect: LayoutRect) => void;
  onLayoutObjectCropChange?: (id: string, crop: LayoutRect) => void;
  onLayoutFilesDrop?: (files: File[], pageNumber: number) => void;
  onLayoutMediaAssetDrop?: (assetId: string, pageNumber: number) => void;
  pageLayoutCountByPage?: Record<number, number>;
  onPageLayoutOpen?: (page: number) => void;
};
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
  pageLayoutCountByPage?: Record<number, number>;
  onPageLayoutOpen?: (page: number) => void;
  selectionHighlightRects?: PdfSelectionHighlightRect[];
} & PdfViewerLayoutProps;

const EMPTY_METRICS = { widthPx: 0, heightPx: 0, widthPt: 0, heightPt: 0 };

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
  pageLayoutCountByPage = {},
  onPageLayoutOpen,
  selectionHighlightRects,
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
}: PdfViewerPageProps) {
  const markersOnPage = markersForPage(pageMarkers, pageNumber).filter(
    (m) => m.kind !== 'accepted_edit',
  );
  const acceptedEditCount = pageAcceptedEditCountByPage[pageNumber] ?? 0;
  const layoutObjectCount = pageLayoutCountByPage[pageNumber] ?? 0;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const renderGenRef = useRef(0);
  const [pageError, setPageError] = useState<string | null>(null);
  const [pageMetrics, setPageMetrics] = useState(EMPTY_METRICS);
  const [dropActive, setDropActive] = useState(false);
  const [dropFileCount, setDropFileCount] = useState(0);
  const [dropMediaTitle, setDropMediaTitle] = useState<string | null>(null);
  const layoutDropEnabled = Boolean(onLayoutFilesDrop || onLayoutMediaAssetDrop);

  function layoutDropFiles(dataTransfer: DataTransfer): File[] {
    return Array.from(dataTransfer.files).filter(
      (file) =>
        file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name),
    );
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    const textLayer = textLayerRef.current;
    if (!canvas || !textLayer || !pdf || !pdfReady) return;
    const generation = ++renderGenRef.current;
    let cancelled = false;
    let renderTask: pdfjs.RenderTask | null = null;
    setPageError(null);
    setPageMetrics(EMPTY_METRICS);
    textLayer.replaceChildren();
    void (async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        if (cancelled || generation !== renderGenRef.current) return;
        const baseViewport = page.getViewport({ scale: 1 });
        const cssScale = computeScale(baseViewport.width);
        const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
        const viewport = page.getViewport({ scale: cssScale * dpr });
        const context = canvas.getContext('2d');
        if (!context || cancelled) return;
        const widthPx = baseViewport.width * cssScale;
        const heightPx = baseViewport.height * cssScale;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${widthPx}px`;
        canvas.style.height = `${heightPx}px`;
        textLayer.style.width = canvas.style.width;
        textLayer.style.height = canvas.style.height;
        if (generation !== renderGenRef.current) return;
        setPageMetrics({
          widthPx,
          heightPx,
          widthPt: baseViewport.width,
          heightPt: baseViewport.height,
        });
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

  const layoutMetricsReady =
    pageMetrics.widthPx > 0 &&
    pageMetrics.heightPx > 0 &&
    pageMetrics.widthPt > 0 &&
    pageMetrics.heightPt > 0;
  const pageWidthMm = pdfPointsToMm(pageMetrics.widthPt);
  const pageHeightMm = pdfPointsToMm(pageMetrics.heightPt);
  const snapStep =
    snapEnabled && layoutMetricsReady
      ? layoutStepFraction(gridStepMm, pageWidthMm)
      : 0;
  const pageGuides =
    layoutEnabled && layoutMetricsReady && showPageGuides
      ? layoutGuidesForPreset(pageWidthMm, pageHeightMm, marginPresetId)
      : null;

  function handleLayoutDragOver(event: DragEvent<HTMLDivElement>) {
    if (!layoutDropEnabled) return;
    const hasFiles = onLayoutFilesDrop && event.dataTransfer.types.includes('Files');
    const hasMedia = onLayoutMediaAssetDrop && event.dataTransfer.types.includes(FOLIO_MEDIA_DRAG_MIME);
    if (!hasFiles && !hasMedia) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
    if (hasFiles) {
      setDropFileCount(layoutDropFiles(event.dataTransfer).length);
      setDropMediaTitle(null);
    } else if (hasMedia) {
      setDropFileCount(0);
      setDropMediaTitle('из медиатеки');
    }
    setDropActive(true);
  }

  function handleLayoutDragLeave(event: DragEvent<HTMLDivElement>) {
    if (!layoutDropEnabled) return;
    const next = event.relatedTarget as Node | null;
    if (next && event.currentTarget.contains(next)) return;
    setDropActive(false);
    setDropFileCount(0);
    setDropMediaTitle(null);
  }

  function handleLayoutDrop(event: DragEvent<HTMLDivElement>) {
    if (!layoutDropEnabled) return;
    event.preventDefault();
    event.stopPropagation();
    setDropActive(false);
    setDropFileCount(0);
    setDropMediaTitle(null);
    if (onLayoutFilesDrop && event.dataTransfer.types.includes('Files')) {
      const files = layoutDropFiles(event.dataTransfer);
      if (files.length > 0) onLayoutFilesDrop(files, pageNumber);
      return;
    }
    if (onLayoutMediaAssetDrop && event.dataTransfer.types.includes(FOLIO_MEDIA_DRAG_MIME)) {
      const raw = event.dataTransfer.getData(FOLIO_MEDIA_DRAG_MIME);
      const payload = raw ? parseFolioMediaDragPayload(raw) : null;
      if (payload) onLayoutMediaAssetDrop(payload.assetId, pageNumber);
    }
  }

  const layoutImages = layoutObjects.filter(isLayoutImageObject);
  const layoutShapes = layoutObjects.filter(isLayoutShapeObject);

  const quoteSelectMode = Boolean(enableTextSelection && showTextLayer && !searchQuery.trim());
  const pageBody = (
    <div
      ref={wrapperRef}
      data-pdf-page={pageNumber}
      className={[
        'pdf-page-root relative inline-block rounded bg-white shadow-sm',
        dropActive ? 'ring-2 ring-folio-400 ring-offset-2' : '',
      ].join(' ')}
      onDragOver={handleLayoutDragOver}
      onDragLeave={handleLayoutDragLeave}
      onDrop={handleLayoutDrop}
      onPointerDown={(event) => {
        if (!layoutEnabled) return;
        const target = event.target as HTMLElement;
        if (target.closest('[data-layout-object]')) return;
        onLayoutObjectSelect?.(null);
      }}
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
      {(acceptedEditCount > 0 || layoutObjectCount > 0 || markersOnPage.length > 0) && (
        <>
          <div className="pointer-events-none absolute top-2 right-2 z-10 flex flex-col items-end gap-1.5">
            {layoutObjectCount > 0 && onPageLayoutOpen && (
              <PdfLayoutObjectsHint
                count={layoutObjectCount}
                onClick={() => onPageLayoutOpen(pageNumber)}
              />
            )}
            {acceptedEditCount > 0 && onPageAcceptedEditsOpen && (
              <PdfAcceptedEditsHint
                count={acceptedEditCount}
                onClick={() => onPageAcceptedEditsOpen(pageNumber)}
              />
            )}
          </div>
          {markersOnPage.length > 0 && (
            <PageMarkersOverlay
              pageNumber={pageNumber}
              markers={markersOnPage}
              pageWidthPx={pageMetrics.widthPx}
              pageHeightPx={pageMetrics.heightPx}
              activeMarkerId={activeMarkerId}
              onMarkerClick={onMarkerClick}
              onOverflowClick={onMarkersOverflowClick}
            />
          )}
        </>
      )}
      {layoutEnabled && layoutMetricsReady && (
        <>
          {pageGuides && (
            <PdfLayoutMarginsOverlay
              pageWidthPx={pageMetrics.widthPx}
              pageHeightPx={pageMetrics.heightPx}
              safe={pageGuides.safe}
              bleed={pageGuides.bleed}
            />
          )}
          {showGrid && (
            <PdfLayoutGrid
              pageWidthPx={pageMetrics.widthPx}
              pageHeightPx={pageMetrics.heightPx}
              stepMm={gridStepMm}
              pageWidthMm={pageWidthMm}
              pageHeightMm={pageHeightMm}
            />
          )}
          <PdfLayoutShapesOverlay
            key={`shapes-${pageNumber}`}
            pageNumber={pageNumber}
            pageWidthPx={pageMetrics.widthPx}
            pageHeightPx={pageMetrics.heightPx}
            shapes={layoutShapes}
            selectedId={selectedObjectId}
            snapStep={snapStep}
            onSelect={onLayoutObjectSelect ?? (() => {})}
            onShapeChange={onLayoutObjectChange ?? (() => {})}
          />
          <PdfLayoutObjectsOverlay
            key={pageNumber}
            pageNumber={pageNumber}
            pageWidthPx={pageMetrics.widthPx}
            pageHeightPx={pageMetrics.heightPx}
            objects={layoutImages}
            selectedId={selectedObjectId}
            cropMode={cropMode}
            snapStep={snapStep}
            onSelect={onLayoutObjectSelect ?? (() => {})}
            onObjectChange={onLayoutObjectChange ?? (() => {})}
            onObjectCropChange={onLayoutObjectCropChange ?? (() => {})}
          />
        </>
      )}
      {dropActive && layoutDropEnabled && (
        <div className="pointer-events-none absolute inset-0 z-[25] flex items-center justify-center bg-folio-500/10">
          <span className="rounded-lg bg-white/95 px-3 py-2 text-sm font-medium text-folio-800 shadow">
            {dropMediaTitle
              ? `Отпустите «${dropMediaTitle}» на стр. ${pageNumber}`
              : dropFileCount > 1
                ? `Отпустите ${dropFileCount} файлов на стр. ${pageNumber}`
                : `Отпустите, чтобы вставить на стр. ${pageNumber}`}
          </span>
        </div>
      )}
      {pageError && <p className="p-2 text-xs text-red-600">{pageError}</p>}
    </div>
  );

  return (
    <PdfLayoutPageShell
      enabled={layoutEnabled}
      metricsReady={layoutMetricsReady}
      pageWidthPx={pageMetrics.widthPx}
      pageHeightPx={pageMetrics.heightPx}
      pageWidthPt={pageMetrics.widthPt}
      pageHeightPt={pageMetrics.heightPt}
      showRulers={showRulers}
      gridStepMm={gridStepMm}
    >
      {pageBody}
    </PdfLayoutPageShell>
  );
}
