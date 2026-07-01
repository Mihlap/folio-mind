import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PdfViewer, PdfViewerToolbar, type PdfPageMarker } from '@folio-mind/ui';
import {
  useDeleteAnnotationMutation,
  useUpdateAnnotationMutation,
  useGetDocumentQuery,
  useGetVersionPreviewsQuery,
  useListAnnotationsQuery,
  clearSearch,
  nextSearchMatch,
  prevSearchMatch,
  resetZoom,
  setDisplayMode,
  setSearchMatches,
  setSearchQuery,
  type ViewerDisplayMode,
  zoomIn,
  zoomOut,
} from '@folio-mind/store';
import { DocumentMobileSheet } from '../../components/documents/DocumentMobileSheet.js';
import { DocumentThumbnailStrip } from '../../components/documents/DocumentThumbnailStrip.js';
import {
  DocumentPageHeader,
  formatVersionStatusLabel,
} from '../../components/documents/DocumentPageHeader.js';
import {
  DocumentRightPanel,
  type DocumentRightTab,
} from '../../components/documents/DocumentRightPanel.js';
import { DocumentVersionsSidebar } from '../../components/documents/DocumentVersionsSidebar.js';
import { DocumentConfidenceNotice } from '../../components/documents/DocumentConfidenceNotice.js';
import { useDocumentWorkspace } from '../../context/document-workspace-context.js';
import { useCreateDocumentUpload } from '../../hooks/useCreateDocumentUpload.js';
import { useDocumentVersionUpload } from '../../hooks/useDocumentVersionUpload.js';
import { useDocumentPdfLoader, pdfLoadStageLabel } from '../../hooks/useDocumentPdfLoader.js';
import { useHorizontalPanelResize } from '../../hooks/useHorizontalPanelResize.js';
import { usePanelToggleCenterY } from '../../hooks/usePanelToggleCenterY.js';
import { useAppDispatch, useAppSelector } from '../../hooks/index.js';
import { annotationsToPageMarkers } from '../../lib/documents/annotationMarkers.js';
import {
  countAcceptedEditsByPage,
  listAcceptedEditAnnotations,
} from '../../lib/documents/acceptedEditOverlays.js';
import { AcceptedEditsModal } from '../../components/documents/AcceptedEditsModal.js';
import type { EditTextInjection } from '../../components/documents/useDocumentAnnotationsPanel.js';
import { useLayoutEditor } from '../../hooks/useLayoutEditor.js';
import { formatLayoutAddSummary } from '../../lib/layout/layoutAddSummary.js';
import type { ToolSectionId } from '../../components/ui/ToolAccordionSection.js';
const INITIAL_THUMB_PAGES = 15;
const RIGHT_PANEL = {
  defaultWidth: 360,
  minExpandedWidth: 280,
  collapseBelow: 260,
  maxWidth: 560,
} as const;
type MobileSheet = null | 'versions' | 'panel';
export function DocumentPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { setWorkspace } = useDocumentWorkspace();
  const { id } = useParams<{
    id: string;
  }>();
  const token = useAppSelector((s) => s.auth.token);
  const viewer = useAppSelector((s) => s.viewer);
  const {
    data: doc,
    isLoading,
    refetch: refetchDocument,
  } = useGetDocumentQuery(id!, {
    skip: !id,
  });
  const [selectedVersionId, setSelectedVersionId] = useState<string | undefined>();
  const [viewerPage, setViewerPage] = useState(1);
  const [pdfNumPages, setPdfNumPages] = useState(0);
  const [focusedAnnotationId, setFocusedAnnotationId] = useState<string | null>(null);
  const [acceptedEditsModalOpen, setAcceptedEditsModalOpen] = useState(false);
  const [editsModalPageFilter, setEditsModalPageFilter] = useState<number | null>(null);
  const editInjectionKeyRef = useRef(0);
  const [editTextInjection, setEditTextInjection] = useState<EditTextInjection | null>(null);
  const [pageNavTick, setPageNavTick] = useState(0);
  const [deleteAnnotation] = useDeleteAnnotationMutation();
  const [updateAnnotation, { isLoading: updatingAnnotation }] = useUpdateAnnotationMutation();
  const [rightTab, setRightTab] = useState<DocumentRightTab>('report');
  const [toolsFocusSection, setToolsFocusSection] = useState<ToolSectionId | null>(null);
  const [layoutAddNotice, setLayoutAddNotice] = useState<string | null>(null);
  const [mobileSheet, setMobileSheet] = useState<MobileSheet>(null);
  const workspaceRowRef = useRef<HTMLDivElement>(null);
  const rightPanelRef = useRef<HTMLElement>(null);
  const rightPanel = useHorizontalPanelResize({
    side: 'right',
    ...RIGHT_PANEL,
  });
  const versions = useMemo(() => doc?.versions ?? [], [doc?.versions]);
  const latest = versions[0];
  const activeVersion = versions.find((v) => v.id === selectedVersionId) ?? latest;
  const versionReady = Boolean(activeVersion && activeVersion.status !== 'pending_upload');
  const layoutPageCount =
    pdfNumPages > 0 ? pdfNumPages : (activeVersion?.pageCount ?? 0);
  const layout = useLayoutEditor({
    versionId: activeVersion?.id,
    viewerPage,
    pageCount: layoutPageCount,
  });
  const {
    pdfViewMode,
    pdfUrl,
    pdfData,
    pdfSourceKey,
    pdfError,
    pdfLoading,
    pdfLoadStage,
    pdfReady,
    pdfProcessing,
    pdfViewerKey,
    onPdfDocumentLoad,
    onPdfDocumentLoadError,
    reloadPdf,
  } = useDocumentPdfLoader({
    documentId: doc?.id,
    versionId: activeVersion?.id,
    versionStatus: activeVersion?.status,
    token,
  });
  const upload = useDocumentVersionUpload(doc?.id ?? '', (versionId) => {
    setSelectedVersionId(versionId);
  });
  const newDocumentUpload = useCreateDocumentUpload((documentId) => {
    navigate(`/app/documents/${documentId}`);
  });
  useEffect(() => {
    if (!doc?.versions.some((v) => v.status === 'processing')) return;
    const timer = setInterval(() => void refetchDocument(), 2000);
    return () => clearInterval(timer);
  }, [doc?.versions, refetchDocument]);
  useEffect(() => {
    if (!doc || selectedVersionId) return;
    if (latest) setSelectedVersionId(latest.id);
  }, [doc?.id, latest?.id, selectedVersionId]);
  useEffect(() => {
    if (!selectedVersionId || versions.length === 0) return;
    if (!versions.some((v) => v.id === selectedVersionId) && latest) {
      setSelectedVersionId(latest.id);
    }
  }, [versions, selectedVersionId, latest?.id]);
  useEffect(() => {
    if (!doc) {
      setWorkspace(null);
      return;
    }
    setWorkspace({
      documentId: doc.id,
      title: doc.title,
      versions,
      selectedVersionId: activeVersion?.id,
      onSelectVersion: setSelectedVersionId,
      onRequestNewVersion: upload.openFilePicker,
      onRequestNewDocxVersion: upload.openDocxFilePicker,
      uploadingNewVersion: upload.uploading,
      uploadError: upload.error,
      uploadStatusHint: upload.uploadHint,
    });
    return () => setWorkspace(null);
  }, [
    doc?.id,
    doc?.title,
    versions,
    activeVersion?.id,
    upload.uploading,
    upload.error,
    upload.uploadHint,
    upload.openFilePicker,
    upload.openDocxFilePicker,
    setWorkspace,
  ]);
  useEffect(() => {
    setViewerPage(1);
    setPdfNumPages(0);
    setFocusedAnnotationId(null);
    setAcceptedEditsModalOpen(false);
    setEditTextInjection(null);
    dispatch(resetZoom());
    dispatch(clearSearch());
  }, [activeVersion?.id, dispatch]);

  useEffect(() => {
    if (pdfNumPages <= 0) return;
    setViewerPage((page) => Math.min(Math.max(1, page), pdfNumPages));
  }, [pdfNumPages]);
  const { data: annotationsData } = useListAnnotationsQuery(
    { documentId: id!, versionId: activeVersion?.id ?? '' },
    { skip: !id || !activeVersion?.id },
  );
  const pageMarkers = useMemo(
    () => annotationsToPageMarkers(annotationsData?.items ?? []),
    [annotationsData?.items],
  );
  const acceptedEditsList = useMemo(
    () => listAcceptedEditAnnotations(annotationsData?.items ?? []),
    [annotationsData?.items],
  );
  const modalAcceptedEdits = useMemo(
    () =>
      editsModalPageFilter != null
        ? acceptedEditsList.filter((e) => e.page === editsModalPageFilter)
        : acceptedEditsList,
    [acceptedEditsList, editsModalPageFilter],
  );
  const pageAcceptedEditCountByPage = useMemo(
    () => countAcceptedEditsByPage(annotationsData?.items ?? []),
    [annotationsData?.items],
  );
  const handleGoToPage = useCallback((page: number, annotationId?: string) => {
    setViewerPage(page);
    setFocusedAnnotationId(annotationId ?? null);
    setPageNavTick((t) => t + 1);
  }, []);
  const layoutActionsRef = useRef({
    enabled: layout.enabled,
    setEnabled: layout.setEnabled,
    distributeAcrossPages: layout.distributeAcrossPages,
    addImageFromFile: layout.addImageFromFile,
    addImagesFromFiles: layout.addImagesFromFiles,
  });
  layoutActionsRef.current = {
    enabled: layout.enabled,
    setEnabled: layout.setEnabled,
    distributeAcrossPages: layout.distributeAcrossPages,
    addImageFromFile: layout.addImageFromFile,
    addImagesFromFiles: layout.addImagesFromFiles,
  };

  const handleLayoutAddImages = useCallback(
    async (
      files: File[],
      options?: { distributeAcrossPages?: boolean; startPage?: number },
    ) => {
      if (!versionReady) {
        throw new Error('Версия документа ещё не готова для макета');
      }
      if (files.length === 0) {
        throw new Error(
          'Файлы не выбраны. Если выбирали несколько — закройте диалог кнопкой «Открыть», не «Отмена».',
        );
      }
      const actions = layoutActionsRef.current;
      if (!actions.enabled) actions.setEnabled(true);
      setRightTab('tools');
      setToolsFocusSection('layout');
      const rawPage = options?.startPage ?? viewerPage;
      const targetPage =
        layoutPageCount > 0
          ? Math.min(Math.max(1, rawPage), layoutPageCount)
          : Math.max(1, rawPage);
      const distribute = options?.distributeAcrossPages ?? false;
      try {
        const created =
          distribute || files.length > 1
            ? await actions.addImagesFromFiles(files, {
                startPage: targetPage,
                distributeAcrossPages: distribute,
              })
            : [await actions.addImageFromFile(files[0]!, targetPage)];
        const focusPage = created[0]!.page;
        handleGoToPage(focusPage);
        setLayoutAddNotice(formatLayoutAddSummary(created));
      } catch (err) {
        setLayoutAddNotice(null);
        throw err;
      }
    },
    [handleGoToPage, layoutPageCount, versionReady, viewerPage],
  );
  const handleLayoutFilesDrop = useCallback(
    async (files: File[], targetPage: number) => {
      try {
        await handleLayoutAddImages(files, {
          distributeAcrossPages: layoutActionsRef.current.distributeAcrossPages,
          startPage: targetPage,
        });
      } catch (err) {
        setLayoutAddNotice(err instanceof Error ? err.message : 'Не удалось добавить изображения');
      }
    },
    [handleLayoutAddImages],
  );
  const handlePageLayoutOpen = useCallback(
    (page: number) => {
      if (!layout.enabled) layout.setEnabled(true);
      setRightTab('tools');
      setToolsFocusSection('layout');
      handleGoToPage(page);
    },
    [handleGoToPage, layout],
  );
  const openAcceptedEditsModal = useCallback(
    (page: number, annotationId?: string, pageFilter?: number | null) => {
      handleGoToPage(page, annotationId);
      setEditsModalPageFilter(pageFilter ?? null);
      setAcceptedEditsModalOpen(true);
    },
    [handleGoToPage],
  );
  const handleMarkerClick = useCallback(
    (marker: PdfPageMarker) => {
      if (marker.kind === 'accepted_edit') {
        openAcceptedEditsModal(marker.page, marker.id);
      } else {
        handleGoToPage(marker.page, marker.id);
      }
    },
    [handleGoToPage, openAcceptedEditsModal],
  );
  const handleTextQuoteForEdit = useCallback(
    ({ text, page, x, y }: { text: string; page: number; x?: number; y?: number }) => {
      editInjectionKeyRef.current += 1;
      setEditTextInjection({
        key: editInjectionKeyRef.current,
        text,
        coords: x != null || y != null ? { x, y } : undefined,
      });
      setRightTab('tools');
      handleGoToPage(page);
    },
    [handleGoToPage],
  );
  const handlePageAcceptedEditsOpen = useCallback(
    (page: number) => {
      const firstOnPage = acceptedEditsList.find((e) => e.page === page);
      openAcceptedEditsModal(page, firstOnPage?.id, page);
    },
    [acceptedEditsList, openAcceptedEditsModal],
  );
  const previewFrom = 1;
  const previewEnd = Math.max(INITIAL_THUMB_PAGES, viewerPage + 14);
  const versionPageCount = activeVersion?.pageCount ?? 0;
  const previewTo: number =
    versionPageCount > 0 ? Math.min(versionPageCount, previewEnd) : previewEnd;
  const expectedInitialThumbs = Math.min(
    versionPageCount > 0 ? versionPageCount : INITIAL_THUMB_PAGES,
    INITIAL_THUMB_PAGES,
  );
  const [pollPreviews, setPollPreviews] = useState(false);
  const { data: previews } = useGetVersionPreviewsQuery(
    {
      documentId: id!,
      versionId: activeVersion?.id ?? '',
      from: previewFrom,
      to: previewTo,
    },
    {
      skip: !id || !activeVersion?.id || activeVersion.status === 'pending_upload',
      pollingInterval: pollPreviews ? 3000 : 0,
    },
  );
  useEffect(() => {
    setPollPreviews(
      activeVersion?.status === 'processing' ||
        previews?.status === 'partial' ||
        previews?.status === 'processing' ||
        (expectedInitialThumbs > 0 &&
          (previews?.pages.length ?? 0) < expectedInitialThumbs &&
          previews?.status !== 'unavailable' &&
          previews?.status !== 'ready'),
    );
  }, [
    activeVersion?.id,
    activeVersion?.status,
    expectedInitialThumbs,
    previews?.pages.length,
    previews?.status,
  ]);
  const handleSearchMatches = useCallback(
    (
      matches: Array<{
        page: number;
        matchIndex: number;
        snippet: string;
      }>,
    ) => {
      dispatch(setSearchMatches(matches));
    },
    [dispatch],
  );
  function openMobilePanel(tab: DocumentRightTab) {
    setRightTab(tab);
    setMobileSheet('panel');
  }
  const openCompareTools = useCallback(() => {
    setRightTab('tools');
    setToolsFocusSection('diff');
    rightPanel.expand();
    setMobileSheet('panel');
  }, [rightPanel]);
  const clearToolsFocusSection = useCallback(() => setToolsFocusSection(null), []);
  usePanelToggleCenterY(
    workspaceRowRef,
    rightPanelRef,
    !isLoading && Boolean(doc),
    rightPanel.collapsed ? 0 : rightPanel.panelWidth,
  );
  if (!id) return null;
  if (isLoading || !doc) {
    return <p className="p-8 text-slate-500">Загрузка…</p>;
  }
  const pdfReadyForUi = pdfReady;
  const statusLabel = formatVersionStatusLabel(
    activeVersion?.status,
    pdfReadyForUi,
    previews?.pages?.length ?? 0,
  );
  const confidenceLevel = activeVersion?.confidenceLevel;
  const showConfidenceNotice =
    confidenceLevel === 'red' || confidenceLevel === 'yellow';
  const sizeLabel = activeVersion?.size
    ? `${(Number(activeVersion.size) / (1024 * 1024)).toFixed(1)} МБ`
    : null;
  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50">
      <input
        ref={upload.inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload.handleFile(file);
        }}
      />
      <input
        ref={upload.docxInputRef}
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload.handleDocxFile(file);
        }}
      />
      <input
        ref={newDocumentUpload.inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void newDocumentUpload.handleFile(file);
        }}
      />

      <DocumentPageHeader
        title={doc.title}
        versions={versions}
        activeVersion={activeVersion}
        latestVersionId={latest?.id}
        statusLabel={statusLabel}
        sizeLabel={sizeLabel}
        newDocumentUploading={newDocumentUpload.uploading}
        newDocumentUploadProgress={newDocumentUpload.uploadProgress}
        versionUploading={upload.uploading}
        newDocumentError={newDocumentUpload.error}
        onSelectVersion={setSelectedVersionId}
        onNewDocument={newDocumentUpload.openFilePicker}
      />

      <div ref={workspaceRowRef} className="flex min-h-0 min-w-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col min-h-0">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-2 sm:p-3">
            {pdfProcessing && (
              <div className="mb-2 shrink-0 rounded-lg border border-folio-200 bg-folio-50/80 px-3 py-2 text-center">
                <p className="text-xs font-medium text-folio-800">
                  Собираем новую версию с правками…
                </p>
                <p className="mt-0.5 text-[11px] text-folio-700/80">
                  Обычно 10–30 секунд. PDF откроется автоматически.
                </p>
              </div>
            )}
            {showConfidenceNotice && (
              <div className="mb-2 shrink-0">
                <DocumentConfidenceNotice
                  level={confidenceLevel === 'red' ? 'red' : 'yellow'}
                  summary={activeVersion?.confidenceSummary}
                  score={activeVersion?.confidenceScore}
                  onOpenCompare={openCompareTools}
                />
              </div>
            )}
            {pdfReadyForUi &&
              activeVersion?.status === 'ready' &&
              (previews?.status === 'partial' ||
                previews?.status === 'processing' ||
                ((previews?.pageCount ?? 0) > 0 &&
                  (previews?.pages.length ?? 0) < Math.min(previews?.pageCount ?? 0, 15))) && (
                <p className="mb-2 shrink-0 text-center text-xs text-slate-500">
                  Миниатюры: {previews?.pages.length ?? 0}
                  {previews?.pageCount ? ` / ${Math.min(previews.pageCount, 15)}` : ''}
                </p>
              )}

            <div className="flex min-h-0 flex-1 gap-2 sm:gap-3">
              <DocumentThumbnailStrip
                versionId={activeVersion?.id}
                pages={previews?.pages ?? []}
                viewerPage={viewerPage}
                initialThumbPages={INITIAL_THUMB_PAGES}
                layout="vertical"
                onGoToPage={handleGoToPage}
              />

              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                <DocumentThumbnailStrip
                  versionId={activeVersion?.id}
                  pages={previews?.pages ?? []}
                  viewerPage={viewerPage}
                  initialThumbPages={INITIAL_THUMB_PAGES}
                  layout="horizontal"
                  onGoToPage={handleGoToPage}
                />

                <div className="shrink-0 border-b border-slate-100 bg-white px-2 py-2">
                  {pdfReadyForUi && (
                    <PdfViewerToolbar
                      displayMode={viewer.displayMode}
                      zoomMode={viewer.zoomMode}
                      customScale={viewer.customScale}
                      searchQuery={viewer.searchQuery}
                      matchCount={viewer.searchMatches.length}
                      activeMatchIndex={viewer.activeMatchIndex}
                      onDisplayModeChange={(mode: ViewerDisplayMode) =>
                        dispatch(setDisplayMode(mode))
                      }
                      onZoomIn={() => dispatch(zoomIn())}
                      onZoomOut={() => dispatch(zoomOut())}
                      onResetZoom={() => dispatch(resetZoom())}
                      onSearchChange={(q: string) => dispatch(setSearchQuery(q))}
                      onPrevMatch={() => dispatch(prevSearchMatch())}
                      onNextMatch={() => dispatch(nextSearchMatch())}
                      onClearSearch={() => dispatch(clearSearch())}
                      layoutMode={layout.enabled}
                      onLayoutModeChange={(enabled) => {
                        layout.setEnabled(enabled);
                        if (enabled) {
                          setRightTab('tools');
                          setToolsFocusSection('layout');
                          rightPanel.expand();
                        }
                      }}
                    />
                  )}
                </div>

                <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-2 sm:p-3">
                  {pdfError && !pdfProcessing && (
                    <div className="rounded-lg bg-red-50 p-4 text-center text-sm text-red-700">
                      <p>{pdfError}</p>
                      <button
                        type="button"
                        className="mt-3 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
                        onClick={() => reloadPdf()}
                      >
                        Повторить
                      </button>
                    </div>
                  )}
                  {(pdfLoading || pdfProcessing) && !pdfReadyForUi && !pdfError && (
                    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-slate-600">
                      {pdfProcessing ? (
                        <>
                          <span
                            className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-folio-200 border-t-folio-600"
                            aria-hidden
                          />
                          <p className="font-medium text-folio-800">
                            {pdfLoadStageLabel(pdfLoadStage === 'processing' ? 'processing' : pdfLoadStage)}
                          </p>
                          <p className="max-w-xs text-center text-xs text-slate-500">
                            Это не ошибка — файл ещё собирается. Можно пока смотреть правки в панели
                            справа.
                          </p>
                        </>
                      ) : (
                        <>
                          <p>Загрузка PDF…</p>
                          <p className="text-xs text-slate-400">{pdfLoadStageLabel(pdfLoadStage)}</p>
                        </>
                      )}
                    </div>
                  )}
                  {pdfReadyForUi && !pdfError && (
                    <div className="relative flex min-h-0 flex-1 flex-col">
                      {pdfLoading && (
                        <p className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 bg-white/85 text-sm text-slate-500">
                          <span>{pdfLoadStageLabel(pdfLoadStage === 'ready' ? 'opening' : pdfLoadStage)}</span>
                        </p>
                      )}
                      <PdfViewer
                        key={pdfViewerKey}
                        className="min-h-0 flex-1"
                        url={pdfViewMode === 'presigned-url' ? (pdfUrl ?? undefined) : undefined}
                        pdfData={pdfViewMode === 'bytes' ? (pdfData ?? undefined) : undefined}
                        sourceKey={pdfSourceKey ?? undefined}
                        onDocumentLoad={onPdfDocumentLoad}
                        onDocumentLoadError={onPdfDocumentLoadError}
                        onDocumentPagesLoad={setPdfNumPages}
                        page={viewerPage}
                        onPageChange={setViewerPage}
                        displayMode={viewer.displayMode}
                        zoomMode={viewer.zoomMode}
                        customScale={viewer.customScale}
                        searchQuery={viewer.searchQuery}
                        activeMatchIndex={viewer.activeMatchIndex}
                        onSearchMatches={handleSearchMatches}
                        pageMarkers={pageMarkers}
                        activeMarkerId={focusedAnnotationId}
                        onMarkerClick={handleMarkerClick}
                        pageAcceptedEditCountByPage={pageAcceptedEditCountByPage}
                        onPageAcceptedEditsOpen={handlePageAcceptedEditsOpen}
                        onMarkersOverflowClick={(page) => {
                          setRightTab('tools');
                          handleGoToPage(page);
                        }}
                        pageNavTick={pageNavTick}
                        enableTextSelection={versionReady && pdfReadyForUi && !layout.enabled}
                        onTextQuoteForEdit={handleTextQuoteForEdit}
                        enabled={layout.enabled}
                        objects={layout.objects}
                        selectedObjectId={layout.selectedId}
                        showGrid={layout.showGrid}
                        showRulers={layout.showRulers}
                        gridStepMm={layout.gridStepMm}
                        snapEnabled={layout.snapEnabled}
                        onLayoutObjectSelect={layout.setSelectedId}
                        onLayoutObjectChange={layout.updateObjectRect}
                        onLayoutFilesDrop={handleLayoutFilesDrop}
                        pageLayoutCountByPage={layout.objectCountByPage}
                        onPageLayoutOpen={handlePageLayoutOpen}
                      />
                    </div>
                  )}
                  {!pdfLoading &&
                    !pdfError &&
                    !pdfReadyForUi &&
                    activeVersion?.status !== 'pending_upload' && (
                      <p className="text-center text-sm text-slate-500">Нет данных для просмотра</p>
                    )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <DocumentRightPanel
          ref={rightPanelRef}
          documentId={doc.id}
          versions={versions}
          activeVersion={activeVersion}
          versionReady={versionReady}
          viewerPage={viewerPage}
          onSelectVersion={setSelectedVersionId}
          onGoToPage={handleGoToPage}
          focusedAnnotationId={focusedAnnotationId}
          onOpenAcceptedEdit={openAcceptedEditsModal}
          onOpenAllAcceptedEdits={() => {
            const first = acceptedEditsList[0];
            if (first) openAcceptedEditsModal(first.page, first.id);
            else setAcceptedEditsModalOpen(true);
          }}
          editTextInjection={editTextInjection}
          toolsFocusSection={toolsFocusSection}
          onToolsFocusSectionHandled={clearToolsFocusSection}
          layout={layout}
          layoutAddNotice={layoutAddNotice}
          layoutPageCount={layoutPageCount}
          onAddLayoutImages={(files, options) => handleLayoutAddImages(files, options)}
          collapsed={rightPanel.collapsed}
          onToggleCollapsed={rightPanel.toggleCollapsed}
          onExpand={rightPanel.expand}
          panelWidth={rightPanel.panelWidth}
          isResizing={rightPanel.isResizing}
          onResizeStart={rightPanel.beginResize}
          activeTab={rightTab}
          onTabChange={setRightTab}
        />
      </div>

      <nav
        className="flex shrink-0 items-stretch justify-around border-t border-slate-200 bg-white pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden"
        aria-label="Панели документа"
      >
        {(
          [
            { id: 'versions' as const, label: 'Версии' },
            { id: 'report' as const, label: 'Отчёт' },
            { id: 'tools' as const, label: 'Инстр.' },
            { id: 'chat' as const, label: 'Чат' },
          ] as const
        ).map((item) => {
          const isActive =
            item.id === 'versions'
              ? mobileSheet === 'versions'
              : mobileSheet === 'panel' && rightTab === item.id;
          return (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              if (item.id === 'versions') {
                setMobileSheet('versions');
                return;
              }
              openMobilePanel(item.id);
            }}
            className={`flex flex-1 cursor-pointer flex-col items-center py-2.5 text-[11px] font-medium transition ${
              isActive
                ? 'bg-folio-50 text-folio-700'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            {item.label}
          </button>
          );
        })}
      </nav>

      <DocumentMobileSheet
        open={mobileSheet === 'versions'}
        title="Версии документа"
        onClose={() => setMobileSheet(null)}
      >
        <DocumentVersionsSidebar variant="drawer" onVersionAction={() => setMobileSheet(null)} />
      </DocumentMobileSheet>

      <AcceptedEditsModal
        open={acceptedEditsModalOpen}
        edits={modalAcceptedEdits}
        pageFilter={editsModalPageFilter}
        focusedId={focusedAnnotationId}
        onClose={() => {
          setAcceptedEditsModalOpen(false);
          setEditsModalPageFilter(null);
        }}
        onGoToPage={handleGoToPage}
        onDelete={
          doc && activeVersion?.id
            ? (annotationId) => {
                void deleteAnnotation({
                  documentId: doc.id,
                  versionId: activeVersion.id,
                  annotationId,
                });
              }
            : undefined
        }
        onUpdate={
          doc && activeVersion?.id
            ? async (annotationId, payload) => {
                await updateAnnotation({
                  documentId: doc.id,
                  versionId: activeVersion.id,
                  annotationId,
                  quote: payload.quote,
                  content: payload.content,
                }).unwrap();
              }
            : undefined
        }
        saving={updatingAnnotation}
      />

      <DocumentMobileSheet
        open={mobileSheet === 'panel'}
        title={rightTab === 'chat' ? 'Чат' : rightTab === 'tools' ? 'Инструменты' : 'Отчёт'}
        onClose={() => setMobileSheet(null)}
      >
        <DocumentRightPanel
          mode="drawer"
          documentId={doc.id}
          versions={versions}
          activeVersion={activeVersion}
          versionReady={versionReady}
          viewerPage={viewerPage}
          onSelectVersion={setSelectedVersionId}
          onGoToPage={handleGoToPage}
          focusedAnnotationId={focusedAnnotationId}
          onOpenAcceptedEdit={openAcceptedEditsModal}
          onOpenAllAcceptedEdits={() => {
            const first = acceptedEditsList[0];
            if (first) openAcceptedEditsModal(first.page, first.id);
            else setAcceptedEditsModalOpen(true);
          }}
          editTextInjection={editTextInjection}
          toolsFocusSection={toolsFocusSection}
          onToolsFocusSectionHandled={clearToolsFocusSection}
          layout={layout}
          layoutAddNotice={layoutAddNotice}
          layoutPageCount={layoutPageCount}
          onAddLayoutImages={(files, options) => handleLayoutAddImages(files, options)}
          collapsed={false}
          onToggleCollapsed={() => {}}
          onExpand={() => {}}
          panelWidth={360}
          isResizing={false}
          onResizeStart={() => {}}
          activeTab={rightTab}
          onTabChange={setRightTab}
        />
      </DocumentMobileSheet>
    </div>
  );
}
