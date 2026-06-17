import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
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
import {
  DocumentPageThumbnail,
  isThumbnailEager,
} from '../../components/documents/DocumentPageThumbnail.js';
import {
  DocumentRightPanel,
  type DocumentRightTab,
} from '../../components/documents/DocumentRightPanel.js';
import { DocumentVersionsSidebar } from '../../components/documents/DocumentVersionsSidebar.js';
import { useDocumentWorkspace } from '../../context/document-workspace-context.js';
import { useCreateDocumentUpload } from '../../hooks/useCreateDocumentUpload.js';
import { useDocumentVersionUpload } from '../../hooks/useDocumentVersionUpload.js';
import { useHorizontalPanelResize } from '../../hooks/useHorizontalPanelResize.js';
import { useAppDispatch, useAppSelector } from '../../hooks/index.js';
import { shellTopHeaderClass } from '../../components/layout/shell-chrome.js';
import { annotationsToPageMarkers } from '../../lib/documents/annotationMarkers.js';
import {
  countAcceptedEditsByPage,
  listAcceptedEditAnnotations,
} from '../../lib/documents/acceptedEditOverlays.js';
import { AcceptedEditsModal } from '../../components/documents/AcceptedEditsModal.js';
import { loadDocumentPdfUrl } from '../../lib/documents/documentPdf.js';

const STATUS_LABEL: Record<string, string> = {
  pending_upload: 'не загружен',
  processing: 'обработка',
  ready: 'готов',
  failed: 'ошибка',
};

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
  const { id } = useParams<{ id: string }>();
  const token = useAppSelector((s) => s.auth.token);
  const viewer = useAppSelector((s) => s.viewer);
  const { data: doc, isLoading, refetch: refetchDocument } = useGetDocumentQuery(id!, {
    skip: !id,
  });

  const [selectedVersionId, setSelectedVersionId] = useState<string | undefined>();
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const pdfUrlRef = useRef<string | null>(null);
  const loadedVersionIdRef = useRef<string | null>(null);
  const [viewerPage, setViewerPage] = useState(1);
  const [focusedAnnotationId, setFocusedAnnotationId] = useState<string | null>(null);
  const [acceptedEditsModalOpen, setAcceptedEditsModalOpen] = useState(false);
  const [editsModalPageFilter, setEditsModalPageFilter] = useState<number | null>(null);
  const [injectedEditBefore, setInjectedEditBefore] = useState<string | null>(null);
  const [pageNavTick, setPageNavTick] = useState(0);
  const [deleteAnnotation] = useDeleteAnnotationMutation();
  const [updateAnnotation, { isLoading: updatingAnnotation }] = useUpdateAnnotationMutation();
  const [rightTab, setRightTab] = useState<DocumentRightTab>('report');
  const [mobileSheet, setMobileSheet] = useState<MobileSheet>(null);

  const rightPanel = useHorizontalPanelResize({
    side: 'right',
    ...RIGHT_PANEL,
  });

  const versions = useMemo(() => doc?.versions ?? [], [doc?.versions]);
  const latest = versions[0];
  const activeVersion = versions.find((v) => v.id === selectedVersionId) ?? latest;

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
    setWorkspace,
  ]);

  useEffect(() => {
    setViewerPage(1);
    setFocusedAnnotationId(null);
    setAcceptedEditsModalOpen(false);
    setInjectedEditBefore(null);
    dispatch(resetZoom());
    dispatch(clearSearch());
  }, [activeVersion?.id, dispatch]);

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
    ({ text, page }: { text: string; page: number }) => {
      setInjectedEditBefore(text);
      queueMicrotask(() => setInjectedEditBefore(null));
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

  useEffect(() => {
    if (!doc || !activeVersion || activeVersion.status === 'pending_upload') {
      setPdfUrl(null);
      setPdfError(null);
      return;
    }

    if (activeVersion.status === 'failed') {
      setPdfUrl(null);
      setPdfError('Версия не обработана — повторите операцию или удалите версию');
      setPdfLoading(false);
      return;
    }

    if (
      loadedVersionIdRef.current === activeVersion.id &&
      activeVersion.status === 'ready' &&
      pdfUrlRef.current
    ) {
      return;
    }

    if (pdfUrlRef.current) {
      URL.revokeObjectURL(pdfUrlRef.current);
      pdfUrlRef.current = null;
    }

    let objectUrl: string | null = null;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let fetchController: AbortController | null = null;
    let attempt = 0;
    const maxAttempts = activeVersion.status === 'processing' ? 30 : 3;

    const loadPdf = () => {
      if (cancelled) return;
      setPdfLoading(true);
      if (attempt === 0) setPdfError(null);

      const controller = new AbortController();
      fetchController = controller;
      const timeout = setTimeout(() => controller.abort(), 20000);
      const delay = activeVersion.status === 'processing' ? 2000 : Math.min(1000 * Math.pow(2, attempt), 8000);

      void loadDocumentPdfUrl(doc.id, activeVersion.id, token, controller.signal)
        .then((url) => {
          clearTimeout(timeout);
          if (cancelled) {
            URL.revokeObjectURL(url);
            return;
          }
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          objectUrl = url;
          pdfUrlRef.current = url;
          loadedVersionIdRef.current = activeVersion.id;
          setPdfUrl(url);
          setPdfLoading(false);
        })
        .catch(() => {
          clearTimeout(timeout);
          if (cancelled) return;
          attempt += 1;
          if (attempt < maxAttempts) {
            retryTimer = setTimeout(loadPdf, delay);
            return;
          }
          setPdfError(
            activeVersion.status === 'processing'
              ? 'PDF ещё готовится. Проверьте, что worker запущен (pnpm dev).'
              : 'Не удалось загрузить PDF для просмотра',
          );
          setPdfLoading(false);
        });
    };

    loadPdf();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (fetchController) fetchController.abort();
    };
  }, [doc?.id, activeVersion?.id, activeVersion?.status, token]);

  useEffect(() => {
    return () => {
      if (pdfUrlRef.current) {
        URL.revokeObjectURL(pdfUrlRef.current);
        pdfUrlRef.current = null;
      }
      loadedVersionIdRef.current = null;
      setPdfUrl(null);
    };
  }, []);

  const handleSearchMatches = useCallback(
    (matches: Array<{ page: number; matchIndex: number; snippet: string }>) => {
      dispatch(setSearchMatches(matches));
    },
    [dispatch],
  );

  function openMobilePanel(tab: DocumentRightTab) {
    setRightTab(tab);
    setMobileSheet('panel');
  }

  if (!id) return null;

  if (isLoading || !doc) {
    return <p className="p-8 text-slate-500">Загрузка…</p>;
  }

  const statusLabel = activeVersion
    ? activeVersion.status === 'processing' &&
      (Boolean(pdfUrl) || (previews?.pages?.length ?? 0) > 0)
      ? 'готов к просмотру'
      : (STATUS_LABEL[activeVersion.status] ?? activeVersion.status)
    : '';
  const versionReady = Boolean(activeVersion && activeVersion.status !== 'pending_upload');
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
        ref={newDocumentUpload.inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void newDocumentUpload.handleFile(file);
        }}
      />

      <header className={`${shellTopHeaderClass} px-3 sm:px-4`}>
        <div className="flex w-full min-w-0 items-center gap-2 sm:gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 gap-y-1">
              <Link
                to="/app"
                className="shrink-0 text-xs text-folio-600 hover:underline sm:text-sm"
              >
                ← Документы
              </Link>
              <h1 className="min-w-0 flex-1 truncate text-base font-semibold text-slate-900 sm:text-lg">
                {doc.title}
              </h1>
              <label className="flex min-w-0 flex-1 items-center gap-2 lg:hidden">
                <span className="sr-only">Версия</span>
                <select
                  value={activeVersion?.id ?? ''}
                  onChange={(e) => setSelectedVersionId(e.target.value)}
                  className="min-w-0 flex-1 cursor-pointer rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                >
                  {versions.map((v) => (
                    <option key={v.id} value={v.id} disabled={v.status === 'pending_upload'}>
                      v{v.version}
                      {v.pageCount ? ` · ${v.pageCount} стр.` : ''}
                      {v.id === latest?.id ? ' (нов.)' : ''}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="mt-1 text-[11px] text-slate-500 sm:text-xs">
              {activeVersion ? (
                <>
                  <span className="hidden lg:inline">Просмотр: </span>
                  v{activeVersion.version} · {statusLabel}
                  {sizeLabel ? ` · ${sizeLabel}` : ''}
                  {activeVersion.pageCount ? ` · ${activeVersion.pageCount} стр.` : ''}
                </>
              ) : (
                'Нет версии'
              )}
            </p>
            {activeVersion?.status === 'pending_upload' && (
              <p className="mt-1 text-xs text-amber-700">Файл не загружен — выберите другую версию.</p>
            )}
            {newDocumentUpload.error && (
              <p className="mt-1 text-xs text-red-600">{newDocumentUpload.error}</p>
            )}
          </div>
          <button
            type="button"
            disabled={newDocumentUpload.uploading || upload.uploading}
            onClick={newDocumentUpload.openFilePicker}
            title="Создать новый документ из PDF"
            className="shrink-0 cursor-pointer self-center rounded-lg bg-folio-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-folio-700 disabled:opacity-50 sm:text-sm"
          >
            {newDocumentUpload.uploading
              ? newDocumentUpload.uploadProgress !== null
                ? `Загрузка ${newDocumentUpload.uploadProgress}%…`
                : 'Загрузка…'
              : '+ Документ'}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col min-h-0">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-2 sm:p-3">
            {activeVersion?.status === 'processing' && !pdfUrl && (
              <p className="mb-2 shrink-0 text-center text-xs text-slate-500">
                {pdfLoading ? 'Загружаем PDF…' : 'Ожидание worker…'}
              </p>
            )}
            {pdfUrl &&
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
              {previews?.pages && previews.pages.length > 0 && (
                <div
                  key={activeVersion?.id}
                  className="scrollbar-thin hidden w-14 shrink-0 flex-col gap-1.5 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 opacity-0 animate-[sidebarFadeIn_0.35s_ease-out_forwards] sm:flex sm:w-16 md:w-[4.5rem]"
                  aria-label="Страницы"
                >
                  {previews.pages.map((thumb) => (
                    <button
                      key={thumb.page}
                      type="button"
                      onClick={() => handleGoToPage(thumb.page)}
                      className={`shrink-0 cursor-pointer overflow-hidden rounded border-2 transition-[border-color,box-shadow] duration-200 ${
                        viewerPage === thumb.page
                          ? 'border-folio-600 ring-1 ring-folio-200'
                          : 'border-slate-200 hover:border-folio-300'
                      }`}
                    >
                      <DocumentPageThumbnail
                        src={thumb.url}
                        alt={`Стр. ${thumb.page}`}
                        layout="vertical"
                        eager={isThumbnailEager(thumb.page, INITIAL_THUMB_PAGES)}
                        staggerMs={Math.min(thumb.page - 1, 14) * 35}
                      />
                    </button>
                  ))}
                </div>
              )}

              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                {previews?.pages && previews.pages.length > 0 && (
                  <div
                    key={activeVersion?.id}
                    className="scrollbar-thin flex gap-1.5 overflow-x-auto border-b border-slate-100 bg-white p-2 opacity-0 animate-[sidebarFadeIn_0.35s_ease-out_forwards] sm:hidden"
                  >
                    {previews.pages.map((thumb) => (
                      <button
                        key={thumb.page}
                        type="button"
                        onClick={() => handleGoToPage(thumb.page)}
                        className={`shrink-0 cursor-pointer overflow-hidden rounded-lg border-2 transition-[border-color] duration-200 ${
                          viewerPage === thumb.page
                            ? 'border-folio-600'
                            : 'border-slate-200'
                        }`}
                      >
                        <DocumentPageThumbnail
                          src={thumb.url}
                          alt={`Стр. ${thumb.page}`}
                          layout="horizontal"
                          eager={isThumbnailEager(thumb.page, INITIAL_THUMB_PAGES)}
                          staggerMs={Math.min(thumb.page - 1, 14) * 35}
                        />
                      </button>
                    ))}
                  </div>
                )}

                <div className="shrink-0 border-b border-slate-100 bg-white px-2 py-2">
                  {pdfUrl && (
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
                    />
                  )}
                </div>

                <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-2 sm:p-3">
                  {pdfLoading && (
                    <p className="text-center text-sm text-slate-500">Загрузка PDF…</p>
                  )}
                  {pdfError && (
                    <p className="rounded-lg bg-red-50 p-4 text-center text-sm text-red-700">
                      {pdfError}
                    </p>
                  )}
                  {!pdfLoading && !pdfError && pdfUrl && (
                    <div className="flex min-h-0 flex-1 flex-col">
                      <PdfViewer
                        className="min-h-0 flex-1"
                        url={pdfUrl}
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
                        enableTextSelection={versionReady && Boolean(pdfUrl)}
                        onTextQuoteForEdit={handleTextQuoteForEdit}
                      />
                    </div>
                  )}
                  {!pdfLoading && !pdfError && !pdfUrl && activeVersion?.status !== 'pending_upload' && (
                    <p className="text-center text-sm text-slate-500">Нет данных для просмотра</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <DocumentRightPanel
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
          injectedEditBefore={injectedEditBefore}
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
        className="flex shrink-0 items-stretch justify-around border-t border-slate-200 bg-white lg:hidden"
        aria-label="Панели документа"
      >
        {(
          [
            { id: 'versions' as const, label: 'Версии' },
            { id: 'report' as const, label: 'Отчёт' },
            { id: 'tools' as const, label: 'Инстр.' },
            { id: 'chat' as const, label: 'Чат' },
          ] as const
        ).map((item) => (
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
            className="flex flex-1 cursor-pointer flex-col items-center py-2.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
          >
            {item.label}
          </button>
        ))}
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
        title={
          rightTab === 'chat' ? 'Чат' : rightTab === 'tools' ? 'Инструменты' : 'Отчёт'
        }
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
          injectedEditBefore={injectedEditBefore}
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
