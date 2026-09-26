import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PdfViewer, PdfViewerToolbar, type PdfPageMarker } from '@folio-mind/ui';
import {
  useDeleteAnnotationMutation,
  useUpdateAnnotationMutation,
  useGetDocumentQuery,
  useGetVersionOcrQuery,
  useGetVersionPreviewsQuery,
  useListAnnotationsQuery,
  useListGuestCommentsQuery,
  useListPageReviewMarksQuery,
  useListShareLinksQuery,
  useRunVersionOcrMutation,
  fetchMediaAssetDataUrl,
  useUploadMediaAssetMutation,
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
  roleHasCapability,
  TEXTLESS_SCAN_REASON,
  isPdfTextLayerUnavailable,
  isVisionOcrInProgressStatus,
} from '@folio-mind/store';
import { DocumentMobileSheet } from '../../components/documents/DocumentMobileSheet.js';
import { DocumentThumbnailStrip } from '../../components/documents/DocumentThumbnailStrip.js';
import { DocumentPageHeader } from '../../components/documents/DocumentPageHeader.js';
import { formatVersionStatusLabel } from '../../components/documents/DocumentPageHeader.utils.js';
import { isDocumentReviewStatus } from '@folio-mind/store';
import {
  DocumentRightPanel,
  type DocumentRightTab,
} from '../../components/documents/DocumentRightPanel.js';
import { DocumentVersionsSidebar } from '../../components/documents/DocumentVersionsSidebar.js';
import { DocumentConfidenceNotice } from '../../components/documents/DocumentConfidenceNotice.js';
import { DocumentSourceDocxBanner } from '../../components/documents/DocumentSourceDocxBanner.js';
import { DocumentVisionOcrBanner } from '../../components/documents/DocumentVisionOcrBanner.js';
import { isVisionOcrInProgress } from '../../components/documents/DocumentVisionOcrBanner.utils.js';
import { useDocumentWorkspace } from '../../context/useDocumentWorkspace.js';
import { useCreateDocumentUpload } from '../../hooks/useCreateDocumentUpload.js';
import { useDocumentVersionUpload } from '../../hooks/useDocumentVersionUpload.js';
import { useDocumentVersionEvents } from '../../hooks/useDocumentVersionEvents.js';
import { useVersionCreatedNotice } from '../../hooks/useVersionCreatedNotice.js';
import { useDocumentPdfLoader, pdfLoadStageLabel } from '../../hooks/useDocumentPdfLoader.js';
import { useHorizontalPanelResize } from '../../hooks/useHorizontalPanelResize.js';
import { usePanelToggleCenterY } from '../../hooks/usePanelToggleCenterY.js';
import { useAppDispatch, useAppSelector } from '../../hooks/index.js';
import { useOnlineStatus } from '../../hooks/useOnlineStatus.js';
import { DocumentOfflineBanner } from '../../components/documents/DocumentOfflineBanner.js';
import {
  loadBookletPreviewCache,
  saveBookletPreviewCache,
  type OfflineBookletCacheEntry,
} from '../../lib/offline/booklet-preview-cache.js';
import { annotationsToPageMarkers } from '../../lib/documents/annotationMarkers.js';
import { guestCommentsToPageMarkers } from '../../lib/documents/guestCommentMarkers.js';
import { isDocumentVersionSelectable } from '../../lib/documents/versionSelection.js';
import {
  pageReviewMarksByPage,
  pageReviewMarksToPageMarkers,
} from '../../lib/documents/pageReviewMarkers.js';
import {
  countAcceptedEditsByPage,
  listAcceptedEditAnnotations,
} from '../../lib/documents/acceptedEditOverlays.js';
import { AcceptedEditsModal } from '../../components/documents/AcceptedEditsModal.js';
import { DocumentPresentationOverlay } from '../../components/documents/DocumentPresentationOverlay.js';
import {
  PdfActionHintBanner,
  type PdfActionHintKind,
} from '../../components/documents/PdfActionHintBanner.js';
import type { EditTextInjection } from '../../components/documents/useDocumentAnnotationsPanel.js';
import { useLayoutEditor } from '../../hooks/useLayoutEditor.js';
import { formatLayoutAddSummary } from '../../lib/layout/layoutAddSummary.js';
import { prepareMediaAssetFile } from '../../lib/media/prepareMediaAssetFile.js';
import type { ToolSectionId } from '../../components/ui/ToolAccordionSection.js';
import { resolveEffectiveDocumentRole, readUserIdFromAuthToken } from '../../lib/documents/document-ui-permissions.js';
const INITIAL_THUMB_PAGES = 15;
const PREVIEW_URL_REFRESH_MS = 50 * 60 * 1000;
const RIGHT_PANEL = {
  defaultWidth: 360,
  minExpandedWidth: 280,
  collapseBelow: 260,
  maxWidth: 560,
} as const;
const DESKTOP_PANEL_QUERY = '(min-width: 768px)';
type MobileSheet = null | 'versions' | 'panel';
export function DocumentPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { setWorkspace } = useDocumentWorkspace();
  const { id } = useParams<{
    id: string;
  }>();
  const token = useAppSelector((s) => s.auth.token);
  const currentUserId =
    useAppSelector((s) => s.auth.user?.id ?? null) ?? readUserIdFromAuthToken(token);
  const viewer = useAppSelector((s) => s.viewer);
  const {
    data: doc,
    isLoading,
    isError,
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
  const [uploadMediaAsset] = useUploadMediaAssetMutation();
  const [rightTab, setRightTab] = useState<DocumentRightTab>('report');
  const [toolsFocusSection, setToolsFocusSection] = useState<ToolSectionId | null>(null);
  const [dismissedConfidenceVersions, setDismissedConfidenceVersions] = useState<Set<string>>(
    () => new Set(),
  );
  const [dismissedDocxBannerVersions, setDismissedDocxBannerVersions] = useState<Set<string>>(
    () => new Set(),
  );
  const [dismissedVisionOcrVersions, setDismissedVisionOcrVersions] = useState<Set<string>>(
    () => new Set(),
  );
  const [layoutAddNotice, setLayoutAddNotice] = useState<string | null>(null);
  const [presentationOpen, setPresentationOpen] = useState(false);
  const [mobileSheet, setMobileSheet] = useState<MobileSheet>(null);
  const [pdfActionHint, setPdfActionHint] = useState<PdfActionHintKind | null>(null);
  const [showDockedRightPanel, setShowDockedRightPanel] = useState(() =>
    typeof window === 'undefined' ? true : window.matchMedia(DESKTOP_PANEL_QUERY).matches,
  );
  const appliedUrlVersionIdRef = useRef<string | null>(null);
  const appliedUrlGuestCommentRef = useRef<string | null>(null);
  const workspaceRowRef = useRef<HTMLDivElement>(null);
  const rightPanelRef = useRef<HTMLElement>(null);
  const rightPanel = useHorizontalPanelResize({
    side: 'right',
    ...RIGHT_PANEL,
  });
  const versions = useMemo(() => doc?.versions ?? [], [doc?.versions]);
  const documentRole = resolveEffectiveDocumentRole(doc?.myRole, doc?.ownerId, currentUserId);
  const canEditDocument = roleHasCapability(documentRole, 'edit');
  const canCommentDocument = roleHasCapability(documentRole, 'comment');
  const canManageShare = roleHasCapability(documentRole, 'manage_share');
  const hasProcessingVersion = versions.some(
    (v) => v.status === 'processing' || isVisionOcrInProgress(v.visionOcrStatus),
  );
  useEffect(() => {
    const media = window.matchMedia(DESKTOP_PANEL_QUERY);
    const sync = () => setShowDockedRightPanel(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  const reviewStatus =
    doc && isDocumentReviewStatus(doc.reviewStatus) ? doc.reviewStatus : ('draft' as const);
  const reviewStatusChangedAt = doc?.reviewStatusChangedAt ?? null;
  const latest = versions[0];
  const handleSelectVersion = useCallback(
    (versionId: string) => {
      const version = versions.find((v) => v.id === versionId);
      if (!version || !isDocumentVersionSelectable(version)) return;
      setSelectedVersionId(versionId);
    },
    [versions],
  );
  const activeVersion = versions.find((v) => v.id === selectedVersionId) ?? latest;
  const versionReady = Boolean(activeVersion && activeVersion.status !== 'pending_upload');
  const noTextLayer = isPdfTextLayerUnavailable({
    textSource: activeVersion?.textSource,
    visionOcrStatus: activeVersion?.visionOcrStatus,
  });
  const [runOcr, runOcrState] = useRunVersionOcrMutation();
  const { data: ocrState } = useGetVersionOcrQuery(
    { documentId: id!, versionId: activeVersion?.id ?? '' },
    {
      skip: !id || !activeVersion?.id || activeVersion.status === 'pending_upload',
      pollingInterval: isVisionOcrInProgressStatus(activeVersion?.visionOcrStatus) ? 3000 : 0,
    },
  );
  const ocrInProgress =
    isVisionOcrInProgressStatus(activeVersion?.visionOcrStatus) ||
    isVisionOcrInProgressStatus(ocrState?.status);
  const canRunOcr = canEditDocument && versionReady && activeVersion?.status !== 'failed';
  const runOcrUnavailableReason = !canEditDocument
    ? 'Распознавание вручную недоступно: нужны права на редактирование.'
    : activeVersion?.status === 'failed'
      ? 'Версия не обработана: сначала дождитесь успешной загрузки файла.'
      : null;
  const ocrStatusFromApi = ocrState?.status ?? null;
  const versionOcrStatus = activeVersion?.visionOcrStatus ?? null;
  useEffect(() => {
    if (!ocrStatusFromApi) return;
    if (ocrStatusFromApi !== versionOcrStatus) void refetchDocument();
  }, [ocrStatusFromApi, versionOcrStatus, refetchDocument]);
  const handleRunOcr = useCallback(() => {
    if (!id || !activeVersion?.id || ocrInProgress || runOcrState.isLoading) return;
    void runOcr({ documentId: id, versionId: activeVersion.id })
      .unwrap()
      .then(() => {
        void refetchDocument();
      })
      .catch(() => {
        /* banner shows the failure state */
      });
  }, [id, activeVersion?.id, ocrInProgress, runOcrState.isLoading, runOcr, refetchDocument]);
  const layoutPageCount = pdfNumPages > 0 ? pdfNumPages : (activeVersion?.pageCount ?? 0);
  useEffect(() => {
    setPresentationOpen(false);
  }, [activeVersion?.id]);
  const layout = useLayoutEditor({
    versionId: activeVersion?.id,
    viewerPage,
    pageCount: layoutPageCount,
  });
  const layoutDisplayPageCount = useMemo(() => {
    const maxObjectPage = layout.objects.reduce(
      (max, item) => Math.max(max, Number(item.page) || 0),
      0,
    );
    return Math.max(layoutPageCount, maxObjectPage);
  }, [layout.objects, layoutPageCount]);
  useEffect(() => {
    if (mobileSheet) setPdfActionHint(null);
  }, [mobileSheet]);
  useEffect(() => {
    if (layout.enabled === false) {
      setPdfActionHint((prev) => (prev === 'layout' ? null : prev));
    }
  }, [layout.enabled]);
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
    pdfErrorRetryable,
    onPdfDocumentLoad,
    onPdfDocumentLoadError,
    reloadPdf,
  } = useDocumentPdfLoader({
    documentId: doc?.id,
    versionId: activeVersion?.id,
    versionStatus: activeVersion?.status,
    versionFailureDetails: activeVersion?.failureDetails,
    versionSizeBytes: activeVersion ? Number(activeVersion.size) : null,
    token,
  });
  const upload = useDocumentVersionUpload(doc?.id ?? '', (versionId) => {
    setSelectedVersionId(versionId);
  });
  const newDocumentUpload = useCreateDocumentUpload((documentId) => {
    navigate(`/app/documents/${documentId}`);
  });
  useEffect(() => {
    if (!hasProcessingVersion) return;
    const timer = setInterval(() => void refetchDocument(), 2000);
    return () => clearInterval(timer);
  }, [hasProcessingVersion, refetchDocument]);
  useEffect(() => {
    if (!doc?.id || selectedVersionId) return;
    const initial = versions.find(isDocumentVersionSelectable) ?? latest;
    if (initial) setSelectedVersionId(initial.id);
  }, [doc?.id, latest, selectedVersionId, versions]);
  useEffect(() => {
    if (!selectedVersionId || versions.length === 0) return;
    if (!versions.some((v) => v.id === selectedVersionId) && latest) {
      const fallback = versions.find(isDocumentVersionSelectable) ?? latest;
      setSelectedVersionId(fallback.id);
    }
  }, [versions, selectedVersionId, latest]);
  useEffect(() => {
    if (!activeVersion || isDocumentVersionSelectable(activeVersion)) return;
    const fallback =
      versions.find((v) => v.id !== activeVersion.id && isDocumentVersionSelectable(v)) ??
      versions.find(isDocumentVersionSelectable);
    if (fallback) setSelectedVersionId(fallback.id);
  }, [activeVersion, versions]);
  useEffect(() => {
    if (!doc?.id) {
      setWorkspace(null);
      return;
    }
    setWorkspace({
      documentId: doc.id,
      title: doc.title,
      documentRole,
      versions,
      selectedVersionId: activeVersion?.id,
      onSelectVersion: handleSelectVersion,
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
    documentRole,
    versions,
    activeVersion?.id,
    upload.uploading,
    upload.error,
    upload.uploadHint,
    upload.openFilePicker,
    upload.openDocxFilePicker,
    handleSelectVersion,
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
    if (layoutDisplayPageCount <= 0) return;
    setViewerPage((page) => Math.min(Math.max(1, page), layoutDisplayPageCount));
  }, [layoutDisplayPageCount]);
  const { data: annotationsData } = useListAnnotationsQuery(
    { documentId: id!, versionId: activeVersion?.id ?? '' },
    { skip: !id || !activeVersion?.id || !canCommentDocument },
  );
  const { data: guestCommentsData } = useListGuestCommentsQuery(
    { documentId: id!, versionId: activeVersion?.id ?? '' },
    {
      skip: !id || !activeVersion?.id || !versionReady || !canManageShare,
      refetchOnFocus: true,
    },
  );
  const { data: shareLinksData } = useListShareLinksQuery(id!, {
    skip: !id || !versionReady || !canManageShare,
  });
  useDocumentVersionEvents({
    documentId: id,
    versionId: activeVersion?.id,
    token,
    currentUserId,
    enabled: Boolean(id && activeVersion?.id && versionReady && token),
  });
  const { data: pageReviewData } = useListPageReviewMarksQuery(
    { documentId: id!, versionId: activeVersion?.id ?? '' },
    { skip: !id || !activeVersion?.id || !versionReady || !canManageShare },
  );
  const reviewMarkByPage = useMemo(
    () => pageReviewMarksByPage(pageReviewData?.items ?? []),
    [pageReviewData?.items],
  );
  const openGuestCommentsCount = useMemo(
    () => (guestCommentsData?.items ?? []).filter((item) => item.status === 'open').length,
    [guestCommentsData?.items],
  );
  const needsFixMarksCount = useMemo(
    () => (pageReviewData?.items ?? []).filter((item) => item.status === 'needs_fix').length,
    [pageReviewData?.items],
  );
  const shareLinks = shareLinksData?.items ?? [];
  const { notice: versionCreatedNotice, dismissNotice: dismissVersionCreatedNotice } =
    useVersionCreatedNotice(versions, activeVersion?.id);
  useEffect(() => {
    if (!versionCreatedNotice) return;
    setRightTab('tools');
  }, [versionCreatedNotice]);
  const pageMarkers = useMemo(
    () => [
      ...pageReviewMarksToPageMarkers(pageReviewData?.items ?? []),
      ...annotationsToPageMarkers(annotationsData?.items ?? []),
      ...guestCommentsToPageMarkers(guestCommentsData?.items ?? [], { openOnly: true }),
    ],
    [pageReviewData?.items, annotationsData?.items, guestCommentsData?.items],
  );
  const guestCommentIds = useMemo(
    () => new Set((guestCommentsData?.items ?? []).map((item) => item.id)),
    [guestCommentsData?.items],
  );
  const focusedGuestCommentId =
    focusedAnnotationId && guestCommentIds.has(focusedAnnotationId) ? focusedAnnotationId : null;
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

  const openShareTools = useCallback(() => {
    setRightTab('tools');
    setToolsFocusSection('share');
    rightPanel.expand();
    if (window.matchMedia('(max-width: 767px)').matches) {
      setMobileSheet('panel');
    }
  }, [rightPanel]);

  const openAnnotationsTools = useCallback(() => {
    setRightTab('tools');
    setToolsFocusSection('annotations');
    rightPanel.expand();
    if (window.matchMedia('(max-width: 767px)').matches) {
      setMobileSheet('panel');
    }
  }, [rightPanel]);

  const openCompareTools = useCallback(() => {
    setRightTab('tools');
    setToolsFocusSection('diff');
    rightPanel.expand();
    if (window.matchMedia('(max-width: 767px)').matches) {
      setMobileSheet('panel');
    }
  }, [rightPanel]);

  useEffect(() => {
    const versionId = searchParams.get('versionId');
    if (!versionId || !versions.some((v) => v.id === versionId)) return;
    if (appliedUrlVersionIdRef.current === versionId) return;
    appliedUrlVersionIdRef.current = versionId;
    handleSelectVersion(versionId);
  }, [handleSelectVersion, searchParams, versions]);

  useEffect(() => {
    const commentId = searchParams.get('guestComment');
    if (!commentId) return;
    if (appliedUrlGuestCommentRef.current === commentId) return;
    appliedUrlGuestCommentRef.current = commentId;
    const comment = guestCommentsData?.items?.find((item) => item.id === commentId);
    if (!comment) return;
    setRightTab('tools');
    setToolsFocusSection('share');
    handleGoToPage(comment.page, comment.id);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('guestComment');
        next.delete('versionId');
        return next;
      },
      { replace: true },
    );
  }, [guestCommentsData?.items, searchParams, handleGoToPage, setSearchParams]);

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

  const uploadLayoutFilesToMediaLibrary = useCallback(
    async (files: File[]): Promise<string> => {
      const results = await Promise.allSettled(
        files.map(async (file) => {
          const prepared = await prepareMediaAssetFile(file);
          return uploadMediaAsset({
            file: prepared.file,
            documentId: doc?.id,
            title: prepared.file.name.replace(/\.[^.]+$/, ''),
            width: prepared.width,
            height: prepared.height,
          }).unwrap();
        }),
      );
      const uploaded = results.filter((r) => r.status === 'fulfilled').length;
      if (uploaded === files.length) {
        return ` Добавлено в медиатеку: ${uploaded}.`;
      }
      if (uploaded > 0) {
        return ` В медиатеку добавлено ${uploaded} из ${files.length}.`;
      }
      const reason = results.find((r) => r.status === 'rejected') as
        | PromiseRejectedResult
        | undefined;
      return ` Не удалось добавить в медиатеку (${reason?.reason instanceof Error ? reason.reason.message : 'ошибка'}).`;
    },
    [doc?.id, uploadMediaAsset],
  );

  const handleLayoutAddImages = useCallback(
    async (files: File[], options?: { distributeAcrossPages?: boolean; startPage?: number }) => {
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
        const baseNotice = formatLayoutAddSummary(created);
        setLayoutAddNotice(baseNotice);
        void uploadLayoutFilesToMediaLibrary(files).then((mediaNote) => {
          setLayoutAddNotice(`${baseNotice}${mediaNote}`);
        });
      } catch (err) {
        setLayoutAddNotice(null);
        throw err;
      }
    },
    [
      handleGoToPage,
      layoutPageCount,
      uploadLayoutFilesToMediaLibrary,
      versionReady,
      viewerPage,
    ],
  );
  const handleLayoutFilesDrop = useCallback(
    async (files: File[], targetPage: number) => {
      if (!canEditDocument) return;
      try {
        await handleLayoutAddImages(files, {
          distributeAcrossPages: layoutActionsRef.current.distributeAcrossPages,
          startPage: targetPage,
        });
      } catch (err) {
        setLayoutAddNotice(err instanceof Error ? err.message : 'Не удалось добавить изображения');
      }
    },
    [canEditDocument, handleLayoutAddImages],
  );
  const handleLayoutMediaAssetDrop = useCallback(
    async (assetId: string, targetPage: number, mediaTitle?: string) => {
      if (!canEditDocument) return;
      try {
        const dataUrl = await fetchMediaAssetDataUrl(assetId, token);
        if (!layout.enabled) layout.setEnabled(true);
        await layout.addImageFromDataUrl(dataUrl, targetPage, undefined, {
          sourceFileName: mediaTitle,
        });
      } catch (err) {
        setLayoutAddNotice(err instanceof Error ? err.message : 'Не удалось вставить из медиатеки');
      }
    },
    [canEditDocument, layout, token],
  );
  const handlePageLayoutOpen = useCallback(
    (page: number) => {
      if (!canEditDocument) return;
      if (!layout.enabled) layout.setEnabled(true);
      setRightTab('tools');
      setToolsFocusSection('layout');
      handleGoToPage(page);
    },
    [canEditDocument, handleGoToPage, layout],
  );
  const openAcceptedEditsModal = useCallback(
    (page: number, annotationId?: string, pageFilter?: number | null) => {
      if (!canEditDocument) return;
      handleGoToPage(page, annotationId);
      setEditsModalPageFilter(pageFilter ?? null);
      setAcceptedEditsModalOpen(true);
    },
    [canEditDocument, handleGoToPage],
  );
  const handleMarkerClick = useCallback(
    (marker: PdfPageMarker) => {
      if (marker.kind === 'accepted_edit') {
        openAcceptedEditsModal(marker.page, marker.id);
        return;
      }
      if (marker.kind === 'guest_comment') {
        openShareTools();
        handleGoToPage(marker.page, marker.id);
        return;
      }
      if (marker.kind === 'page_review_ok' || marker.kind === 'page_review_fix') {
        openShareTools();
        handleGoToPage(marker.page);
        return;
      }
      if (marker.kind === 'comment' || marker.kind === 'highlight') {
        openAnnotationsTools();
        handleGoToPage(marker.page, marker.id);
        return;
      }
      handleGoToPage(marker.page, marker.id);
    },
    [handleGoToPage, openAcceptedEditsModal, openAnnotationsTools, openShareTools],
  );
  const handleTextQuoteForEdit = useCallback(
    ({
      text,
      page,
      x,
      y,
      pageWidthPx,
      pageHeightPx,
    }: {
      text: string;
      page: number;
      x?: number;
      y?: number;
      pageWidthPx?: number;
      pageHeightPx?: number;
    }) => {
      if (!canEditDocument) return;
      editInjectionKeyRef.current += 1;
      setEditTextInjection({
        key: editInjectionKeyRef.current,
        text,
        coords: x != null || y != null ? { x, y, pageWidthPx, pageHeightPx } : undefined,
      });
      setPdfActionHint((prev) => (prev === 'text-selection' ? null : prev));
      setRightTab('tools');
      rightPanel.expand();
      if (window.matchMedia('(max-width: 767px)').matches) {
        setMobileSheet('panel');
      }
      handleGoToPage(page);
    },
    [canEditDocument, handleGoToPage, rightPanel],
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
      pollingInterval: pollPreviews ? 2000 : 0,
    },
  );
  const [mergedPreviewPages, setMergedPreviewPages] = useState<
    Array<{ page: number; url: string; at: number }>
  >([]);
  useEffect(() => {
    setMergedPreviewPages([]);
  }, [id, activeVersion?.id]);
  useEffect(() => {
    const incoming = previews?.pages;
    if (!incoming?.length) return;
    setMergedPreviewPages((prev) => {
      const byPage = new Map(prev.map((item) => [item.page, item]));
      const now = Date.now();
      let changed = false;
      for (const item of incoming) {
        const existing = byPage.get(item.page);
        if (!existing) {
          byPage.set(item.page, { page: item.page, url: item.url, at: now });
          changed = true;
        } else if (now - existing.at > PREVIEW_URL_REFRESH_MS) {
          byPage.set(item.page, { page: item.page, url: item.url, at: now });
          changed = true;
        }
      }
      if (!changed) return prev;
      return [...byPage.values()].sort((a, b) => a.page - b.page);
    });
  }, [previews?.pages]);
  useEffect(() => {
    setPollPreviews(
      activeVersion?.status === 'processing' ||
        previews?.status === 'partial' ||
        previews?.status === 'processing' ||
        (expectedInitialThumbs > 0 &&
          mergedPreviewPages.length < expectedInitialThumbs &&
          previews?.status !== 'unavailable' &&
          previews?.status !== 'ready'),
    );
  }, [
    activeVersion?.id,
    activeVersion?.status,
    expectedInitialThumbs,
    mergedPreviewPages.length,
    previews?.status,
  ]);

  const online = useOnlineStatus();
  const [offlineCache, setOfflineCache] = useState<OfflineBookletCacheEntry | null>(null);

  useEffect(() => {
    if (online || !id || !activeVersion?.id) {
      setOfflineCache(null);
      return;
    }
    let cancelled = false;
    void loadBookletPreviewCache(id, activeVersion.id).then((entry) => {
      if (!cancelled) setOfflineCache(entry);
    });
    return () => {
      cancelled = true;
    };
  }, [online, id, activeVersion?.id]);

  useEffect(() => {
    if (!online || !id || !activeVersion?.id || mergedPreviewPages.length === 0) return;
    const title = doc?.title ?? 'Документ';
    void saveBookletPreviewCache({
      documentId: id,
      versionId: activeVersion.id,
      title,
      pageCount: versionPageCount || previews?.pageCount || mergedPreviewPages.length,
      pages: mergedPreviewPages.map(({ page, url }) => ({ page, url })),
      token,
    }).catch(() => {
      /* best-effort offline cache */
    });
  }, [
    online,
    id,
    activeVersion?.id,
    doc?.title,
    versionPageCount,
    previews?.pageCount,
    mergedPreviewPages,
  ]);

  const displayPreviewPages =
    !online && offlineCache && offlineCache.pages.length > 0
      ? offlineCache.pages.map((p) => ({ page: p.page, url: p.dataUrl }))
      : mergedPreviewPages;
  const showOfflineBanner = !online && (offlineCache?.pages.length ?? 0) > 0;
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
  const requestPdfInteraction = useCallback(
    (kind: PdfActionHintKind) => {
      if (typeof window !== 'undefined' && !window.matchMedia('(max-width: 767px)').matches) return;
      setMobileSheet(null);
      setPdfActionHint(kind);
    },
    [],
  );
  const reopenToolsFromHint = useCallback(() => {
    setPdfActionHint(null);
    setRightTab('tools');
    setMobileSheet('panel');
  }, []);
  const dismissConfidenceNotice = useCallback((versionId: string) => {
    setDismissedConfidenceVersions((prev) => {
      const next = new Set(prev);
      next.add(versionId);
      return next;
    });
  }, []);
  const dismissDocxBanner = useCallback((versionId: string) => {
    setDismissedDocxBannerVersions((prev) => {
      const next = new Set(prev);
      next.add(versionId);
      return next;
    });
  }, []);
  const dismissVisionOcrBanner = useCallback((versionId: string) => {
    setDismissedVisionOcrVersions((prev) => {
      const next = new Set(prev);
      next.add(versionId);
      return next;
    });
  }, []);
  const clearToolsFocusSection = useCallback(() => setToolsFocusSection(null), []);
  usePanelToggleCenterY(
    workspaceRowRef,
    rightPanelRef,
    !isLoading && Boolean(doc),
    rightPanel.collapsed ? 0 : rightPanel.panelWidth,
  );
  if (!id) return null;
  if (!isLoading && (isError || !doc)) {
    return (
      <div className="p-8">
        <p className="text-slate-700">Документ не найден или нет доступа.</p>
        <button
          type="button"
          onClick={() => navigate('/app')}
          className="mt-3 cursor-pointer text-sm font-medium text-folio-600 hover:underline"
        >
          К списку документов
        </button>
      </div>
    );
  }
  if (isLoading || !doc) {
    return <p className="p-8 text-slate-500">Загрузка…</p>;
  }
  const pdfReadyForUi = pdfReady;
  const statusLabel = formatVersionStatusLabel(
    activeVersion?.status,
    pdfReadyForUi,
    mergedPreviewPages.length,
  );
  const confidenceLevel = activeVersion?.confidenceLevel;
  const showConfidenceNotice =
    (confidenceLevel === 'red' || confidenceLevel === 'yellow') &&
    Boolean(activeVersion?.id) &&
    !dismissedConfidenceVersions.has(activeVersion.id);
  const showDocxBanner =
    Boolean(id && activeVersion?.id && activeVersion.status === 'ready') &&
    !dismissedDocxBannerVersions.has(activeVersion.id);
  const showVisionOcrBanner =
    Boolean(activeVersion?.id && activeVersion.visionOcrStatus) &&
    activeVersion.visionOcrStatus !== 'not_needed' &&
    !dismissedVisionOcrVersions.has(activeVersion.id);
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
        documentId={doc.id}
        title={doc.title}
        reviewStatus={reviewStatus}
        projectId={doc.projectId}
        projectName={doc.projectName}
        versions={versions}
        activeVersion={activeVersion}
        latestVersionId={latest?.id}
        statusLabel={statusLabel}
        sizeLabel={sizeLabel}
        newDocumentUploading={newDocumentUpload.uploading}
        newDocumentUploadProgress={newDocumentUpload.uploadProgress}
        versionUploading={upload.uploading}
        newDocumentError={newDocumentUpload.error}
        onSelectVersion={handleSelectVersion}
        onNewDocument={newDocumentUpload.openFilePicker}
      />

      <div ref={workspaceRowRef} className="flex min-h-0 min-w-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col min-h-0">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-2 sm:p-3">
            {showConfidenceNotice && (
              <div className="mb-2 shrink-0">
                <DocumentConfidenceNotice
                  level={confidenceLevel === 'red' ? 'red' : 'yellow'}
                  summary={activeVersion?.confidenceSummary}
                  score={activeVersion?.confidenceScore}
                  onOpenCompare={openCompareTools}
                  onDismiss={() => dismissConfidenceNotice(activeVersion!.id)}
                />
              </div>
            )}
            {canEditDocument && showDocxBanner && (
              <div className="mb-2 shrink-0">
                <DocumentSourceDocxBanner
                  documentId={id}
                  versionId={activeVersion!.id}
                  sourceDocxKey={activeVersion!.sourceDocxKey}
                  onAttached={() => void refetchDocument()}
                  onDismiss={() => dismissDocxBanner(activeVersion!.id)}
                />
              </div>
            )}
            {showVisionOcrBanner && (
              <DocumentVisionOcrBanner
                status={activeVersion!.visionOcrStatus}
                textSource={activeVersion!.textSource}
                onDismiss={
                  isVisionOcrInProgress(activeVersion!.visionOcrStatus)
                    ? undefined
                    : () => dismissVisionOcrBanner(activeVersion!.id)
                }
                onRunOcr={canRunOcr ? handleRunOcr : undefined}
                canRunOcr={canRunOcr}
                runOcrUnavailableReason={runOcrUnavailableReason}
                ocrRunning={ocrInProgress || runOcrState.isLoading}
                ocrProgress={
                  ocrState
                    ? { pagesDone: ocrState.pagesDone, pagesTotal: ocrState.pagesTotal }
                    : null
                }
                ocrError={ocrState?.error ?? null}
              />
            )}
            {showOfflineBanner && offlineCache && (
              <DocumentOfflineBanner
                cachedPages={offlineCache.pages.length}
                savedAt={offlineCache.savedAt}
              />
            )}
            {pdfReadyForUi &&
              activeVersion?.status === 'ready' &&
              (previews?.status === 'partial' ||
                previews?.status === 'processing' ||
                ((previews?.pageCount ?? 0) > 0 &&
                  mergedPreviewPages.length < Math.min(previews?.pageCount ?? 0, 15))) && (
                <p className="mb-2 shrink-0 text-center text-xs text-slate-500">
                  Миниатюры: {mergedPreviewPages.length}
                  {previews?.pageCount ? ` / ${Math.min(previews.pageCount, 15)}` : ''}
                </p>
              )}

            <div className="flex min-h-0 flex-1 gap-2 sm:gap-3">
              <DocumentThumbnailStrip
                versionId={activeVersion?.id}
                pages={displayPreviewPages}
                viewerPage={viewerPage}
                initialThumbPages={INITIAL_THUMB_PAGES}
                layout="vertical"
                reviewMarkByPage={reviewMarkByPage}
                onGoToPage={handleGoToPage}
              />

              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
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
                      searchDisabled={noTextLayer}
                      searchDisabledReason={TEXTLESS_SCAN_REASON}
                      layoutMode={canEditDocument && layout.enabled}
                      onLayoutModeChange={
                        canEditDocument
                          ? (enabled) => {
                              layout.setEnabled(enabled);
                              if (enabled) {
                                setRightTab('tools');
                                setToolsFocusSection('layout');
                                rightPanel.expand();
                              }
                            }
                          : undefined
                      }
                      onPresentationStart={() => setPresentationOpen(true)}
                      presentationDisabled={!versionReady || !pdfReadyForUi || layoutPageCount <= 0}
                    />
                  )}
                </div>

                <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-2 sm:p-3">
                  {pdfError && !pdfProcessing && (
                    <div className="rounded-lg bg-red-50 p-4 text-center text-sm text-red-700">
                      <p className="break-words">{pdfError}</p>
                      {pdfErrorRetryable || activeVersion?.status !== 'failed' ? (
                        <button
                          type="button"
                          className="mt-3 cursor-pointer rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
                          onClick={() => reloadPdf()}
                        >
                          Повторить
                        </button>
                      ) : (
                        <p className="mt-2 text-xs text-red-500">
                          Исправьте поле «Было» неприменённой правки и нажмите «Применить правки»
                          ещё раз, либо загрузите исходный DOCX.
                        </p>
                      )}
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
                            {pdfLoadStageLabel(
                              pdfLoadStage === 'processing' ? 'processing' : pdfLoadStage,
                            )}
                          </p>
                          <p className="max-w-xs text-center text-xs text-slate-500">
                            Это не ошибка — файл ещё собирается. Можно пока смотреть правки в панели
                            справа.
                          </p>
                        </>
                      ) : (
                        <>
                          <p>Загрузка PDF…</p>
                          <p className="text-xs text-slate-400">
                            {pdfLoadStageLabel(pdfLoadStage)}
                          </p>
                        </>
                      )}
                    </div>
                  )}
                  {pdfReadyForUi && !pdfError && (
                    <div className="relative flex min-h-0 flex-1 flex-col">
                      {pdfActionHint && (
                        <PdfActionHintBanner
                          kind={pdfActionHint}
                          onDismiss={() => setPdfActionHint(null)}
                          onOpenTools={reopenToolsFromHint}
                        />
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
                        enableTextSelection={
                          canEditDocument && versionReady && pdfReadyForUi && !layout.enabled
                        }
                        textSelectionActive={pdfActionHint === 'text-selection'}
                        onTextQuoteForEdit={canEditDocument ? handleTextQuoteForEdit : undefined}
                        enabled={canEditDocument && layout.enabled}
                        objects={layout.objects}
                        selectedObjectId={layout.selectedId}
                        showGrid={layout.showGrid}
                        showRulers={layout.showRulers}
                        gridStepMm={layout.gridStepMm}
                        snapEnabled={layout.snapEnabled}
                        cropMode={layout.cropMode}
                        showPageGuides={layout.showPageGuides}
                        marginPresetId={layout.marginPresetId}
                        onLayoutObjectSelect={layout.setSelectedId}
                        onLayoutObjectChange={layout.updateObjectRect}
                        onLayoutObjectCropChange={layout.updateObjectCrop}
                        onLayoutFilesDrop={canEditDocument ? handleLayoutFilesDrop : undefined}
                        onLayoutMediaAssetDrop={
                          canEditDocument ? handleLayoutMediaAssetDrop : undefined
                        }
                        pageLayoutCountByPage={layout.objectCountByPage}
                        onPageLayoutOpen={canEditDocument ? handlePageLayoutOpen : undefined}
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

        {showDockedRightPanel && (
          <DocumentRightPanel
            ref={rightPanelRef}
            documentId={doc.id}
            versions={versions}
            activeVersion={activeVersion}
            versionReady={versionReady}
            viewerPage={viewerPage}
            onSelectVersion={handleSelectVersion}
            onGoToPage={handleGoToPage}
            focusedAnnotationId={focusedAnnotationId}
            focusedGuestCommentId={focusedGuestCommentId}
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
            reviewStatus={reviewStatus}
            reviewStatusChangedAt={reviewStatusChangedAt}
            documentTitle={doc.title}
            projectId={doc.projectId}
            projectName={doc.projectName}
            shareLinks={shareLinks}
            openGuestCommentsCount={openGuestCommentsCount}
            needsFixMarksCount={needsFixMarksCount}
            acceptedEditsCount={acceptedEditsList.length}
            versionCreatedNotice={versionCreatedNotice}
            onDismissVersionCreatedNotice={dismissVersionCreatedNotice}
            documentRole={documentRole}
            currentUserId={currentUserId}
            collapsed={rightPanel.collapsed}
            onToggleCollapsed={rightPanel.toggleCollapsed}
            onExpand={rightPanel.expand}
            panelWidth={rightPanel.panelWidth}
            isResizing={rightPanel.isResizing}
            onResizeStart={rightPanel.beginResize}
            activeTab={rightTab}
            onTabChange={setRightTab}
          />
        )}
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
              className={`touch-target flex flex-1 cursor-pointer flex-col items-center justify-center py-2.5 text-[11px] font-medium transition ${
                isActive ? 'bg-folio-50 text-folio-700' : 'text-slate-600 hover:bg-slate-50'
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
        <DocumentVersionsSidebar
          variant="drawer"
          documentRole={documentRole}
          onVersionAction={() => setMobileSheet(null)}
        />
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
                })
                  .unwrap()
                  .catch(() => {});
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
                  contentFormat: payload.contentFormat ?? 'markdown',
                }).unwrap();
              }
            : undefined
        }
        saving={updatingAnnotation}
      />

      {doc && activeVersion?.id && (
        <DocumentPresentationOverlay
          open={presentationOpen}
          onClose={() => setPresentationOpen(false)}
          documentTitle={doc.title}
          page={viewerPage}
          pageCount={layoutPageCount}
          onPageChange={handleGoToPage}
          pdfUrl={pdfViewMode === 'presigned-url' ? (pdfUrl ?? undefined) : undefined}
          pdfData={pdfViewMode === 'bytes' ? (pdfData ?? undefined) : undefined}
          pdfSourceKey={pdfSourceKey ?? undefined}
          pdfReady={pdfReadyForUi}
        />
      )}

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
          onSelectVersion={handleSelectVersion}
          onGoToPage={handleGoToPage}
          focusedAnnotationId={focusedAnnotationId}
          focusedGuestCommentId={focusedGuestCommentId}
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
          reviewStatus={reviewStatus}
          reviewStatusChangedAt={reviewStatusChangedAt}
          documentTitle={doc.title}
          projectId={doc.projectId}
          projectName={doc.projectName}
          shareLinks={shareLinks}
          openGuestCommentsCount={openGuestCommentsCount}
          needsFixMarksCount={needsFixMarksCount}
          acceptedEditsCount={acceptedEditsList.length}
          versionCreatedNotice={versionCreatedNotice}
          onDismissVersionCreatedNotice={dismissVersionCreatedNotice}
          documentRole={documentRole}
          currentUserId={currentUserId}
          collapsed={false}
          onToggleCollapsed={() => {}}
          onExpand={() => {}}
          panelWidth={360}
          isResizing={false}
          onResizeStart={() => {}}
          activeTab={rightTab}
          onTabChange={setRightTab}
          onRequestPdfInteraction={requestPdfInteraction}
        />
      </DocumentMobileSheet>
    </div>
  );
}
