import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PdfViewer, PdfViewerToolbar } from '@folio-mind/ui';
import {
  useExportReportMutation,
  useGetAiProvidersQuery,
  useGetDocumentQuery,
  useGetJobQuery,
  useGetVersionPreviewsQuery,
  useRequestSummaryMutation,
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
import { DocumentAiPanel } from '../../components/documents/DocumentAiPanel.js';
import { DocumentPdfOperationsPanel } from '../../components/documents/DocumentPdfOperationsPanel.js';
import { DocumentVersionsPanel } from '../../components/documents/DocumentVersionsPanel.js';
import { useAppDispatch, useAppSelector } from '../../hooks/index.js';
import { loadDocumentPdfUrl } from '../../lib/documents/documentPdf.js';

const STATUS_LABEL: Record<string, string> = {
  pending_upload: 'не загружен',
  processing: 'обработка',
  ready: 'готов',
  failed: 'ошибка',
};

function openDownloadUrl(url: string, target: '_self' | '_blank' = '_self') {
  if (target === '_blank') {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  window.location.assign(url);
}

export function DocumentPage() {
  const MIN_AI_PANEL_WIDTH = 320;
  const MAX_AI_PANEL_WIDTH = 760;
  const dispatch = useAppDispatch();
  const { id } = useParams<{ id: string }>();
  const token = useAppSelector((s) => s.auth.token);
  const viewer = useAppSelector((s) => s.viewer);
  const { data: doc, isLoading, refetch: refetchDocument } = useGetDocumentQuery(id!, {
    skip: !id,
  });

  useEffect(() => {
    if (!doc?.versions.some((v) => v.status === 'processing')) return;
    const timer = setInterval(() => void refetchDocument(), 2000);
    return () => clearInterval(timer);
  }, [doc?.versions, refetchDocument]);
  const { data: providersData } = useGetAiProvidersQuery();
  const [requestSummary, { isLoading: summaryRequestLoading }] = useRequestSummaryMutation();
  const [exportReport, { isLoading: exportLoading }] = useExportReportMutation();
  const [selectedVersionId, setSelectedVersionId] = useState<string | undefined>();
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [viewerPage, setViewerPage] = useState(1);
  const [aiPanelWidth, setAiPanelWidth] = useState(360);
  const [isResizingAiPanel, setIsResizingAiPanel] = useState(false);
  const [summaryJobId, setSummaryJobId] = useState<string | null>(null);
  const [pollSummary, setPollSummary] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportFormatLoading, setExportFormatLoading] = useState<'pdf' | 'word' | null>(null);
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(true);
  const [isDesktop, setIsDesktop] = useState(
    typeof window === 'undefined' ? true : window.innerWidth >= 1024,
  );

  const versions = doc?.versions ?? [];
  const latest = versions[0];
  const activeVersion =
    versions.find((v) => v.id === selectedVersionId) ?? latest;

  useEffect(() => {
    if (!doc || selectedVersionId) return;
    if (latest) setSelectedVersionId(latest.id);
  }, [doc?.id, latest?.id, selectedVersionId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => setIsDesktop(window.innerWidth >= 1024);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!isDesktop || !isResizingAiPanel || typeof window === 'undefined') return;

    const onMove = (event: MouseEvent) => {
      const next = window.innerWidth - event.clientX - 32;
      const maxByViewport = Math.max(MIN_AI_PANEL_WIDTH, window.innerWidth - 520);
      const clamped = Math.min(Math.max(next, MIN_AI_PANEL_WIDTH), Math.min(MAX_AI_PANEL_WIDTH, maxByViewport));
      setAiPanelWidth(clamped);
    };
    const onUp = () => setIsResizingAiPanel(false);

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isDesktop, isResizingAiPanel]);

  useEffect(() => {
    setViewerPage(1);
    dispatch(resetZoom());
    dispatch(clearSearch());
  }, [activeVersion?.id, dispatch]);

  const thumbFrom = Math.max(1, viewerPage - 5);
  const thumbTo = viewerPage + 14;
  const [pollPartialPreviews, setPollPartialPreviews] = useState(false);
  const { data: summaryJob } = useGetJobQuery(summaryJobId!, {
    skip: !summaryJobId,
    pollingInterval: pollSummary ? 2000 : 0,
  });
  const summaryText =
    summaryJob?.status === 'completed' ? (summaryJob.payload?.summary ?? null) : null;
  const summaryPending =
    summaryJob?.status === 'queued' ||
    summaryJob?.status === 'processing' ||
    (summaryRequestLoading && !summaryText);

  const { data: previews } = useGetVersionPreviewsQuery(
    {
      documentId: id!,
      versionId: activeVersion?.id ?? '',
      from: thumbFrom,
      to: thumbTo,
    },
    {
      skip: !id || !activeVersion?.id || activeVersion.status === 'pending_upload',
      pollingInterval:
        activeVersion?.status === 'processing' || pollPartialPreviews ? 3000 : 0,
    },
  );

  useEffect(() => {
    setPollPartialPreviews(previews?.status === 'partial');
  }, [previews?.status]);

  useEffect(() => {
    setSummaryJobId(null);
    setPollSummary(false);
    setSummaryError(null);
    setExportError(null);
    setExportFormatLoading(null);
    setIsSummaryExpanded(true);
  }, [activeVersion?.id]);

  useEffect(() => {
    if (summaryJob?.status === 'completed' || summaryJob?.status === 'failed') {
      setPollSummary(false);
      if (summaryJob.status === 'failed') {
        const msg =
          typeof summaryJob.payload === 'object' &&
          summaryJob.payload &&
          'error' in summaryJob.payload
            ? String((summaryJob.payload as { error?: string }).error ?? 'Не удалось получить пересказ')
            : 'Не удалось получить пересказ';
        setSummaryError(msg);
      }
    }
  }, [summaryJob?.payload, summaryJob?.status]);

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

    let objectUrl: string | null = null;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    const maxAttempts = activeVersion.status === 'processing' ? 90 : 1;

    const loadPdf = () => {
      if (cancelled) return;
      setPdfLoading(true);
      if (attempt === 0) setPdfError(null);

      void loadDocumentPdfUrl(doc.id, activeVersion.id, token)
        .then((url) => {
          if (cancelled) {
            URL.revokeObjectURL(url);
            return;
          }
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          objectUrl = url;
          setPdfUrl(url);
          setPdfLoading(false);
        })
        .catch(() => {
          if (cancelled) return;
          attempt += 1;
          if (attempt < maxAttempts && activeVersion.status === 'processing') {
            retryTimer = setTimeout(loadPdf, 2000);
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
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setPdfUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [doc?.id, activeVersion?.id, activeVersion?.status, token]);

  const handleSearchMatches = useCallback(
    (matches: Array<{ page: number; matchIndex: number; snippet: string }>) => {
      dispatch(setSearchMatches(matches));
    },
    [dispatch],
  );

  if (!id) return null;

  if (isLoading || !doc) {
    return <p className="p-8 text-slate-500">Загрузка…</p>;
  }

  const statusLabel = activeVersion
    ? activeVersion.status === 'processing' && (Boolean(pdfUrl) || (previews?.pages?.length ?? 0) > 0)
      ? 'готов к просмотру'
      : (STATUS_LABEL[activeVersion.status] ?? activeVersion.status)
    : '';
  const versionReady = Boolean(activeVersion && activeVersion.status !== 'pending_upload');
  const canExportReport = versionReady && Boolean(summaryText);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <Link to="/app" className="text-sm text-folio-600 hover:underline">
        ← К документам
      </Link>
      <h1 className="mt-3 break-words text-xl font-semibold text-slate-900 sm:mt-4 sm:text-2xl">{doc.title}</h1>
      <p className="mt-1 text-xs text-slate-500 sm:text-sm">
        Просмотр: версия {activeVersion?.version ?? '—'} · {statusLabel}
        {activeVersion?.size
          ? ` · ${(Number(activeVersion.size) / (1024 * 1024)).toFixed(1)} МБ`
          : ''}
      </p>

      {activeVersion?.status === 'pending_upload' && (
        <p className="mt-4 text-sm text-amber-700">
          Файл этой версии не загружен. Выберите другую версию или загрузите PDF заново.
        </p>
      )}

      <DocumentVersionsPanel
        documentId={doc.id}
        versions={versions}
        selectedVersionId={activeVersion?.id}
        onSelectVersion={setSelectedVersionId}
      />

      <DocumentPdfOperationsPanel
        documentId={doc.id}
        versions={versions}
        activeVersion={activeVersion}
        viewerPage={viewerPage}
        onSelectVersion={setSelectedVersionId}
      />

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
          <button
            type="button"
            disabled={!versionReady || summaryPending}
            onClick={async () => {
              if (!activeVersion) return;
              try {
                setSummaryError(null);
                const result = await requestSummary({
                  documentId: doc.id,
                  versionId: activeVersion.id,
                  provider: providersData?.defaultProvider,
                }).unwrap();
                setSummaryJobId(result.jobId);
                setPollSummary(result.status !== 'completed');
              } catch (error) {
                setSummaryError(
                  error instanceof Error ? error.message : 'Не удалось получить пересказ',
                );
              }
            }}
            className="w-full cursor-pointer rounded-lg bg-folio-600 px-4 py-2 text-sm font-medium text-white hover:bg-folio-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {summaryPending ? 'Получаем пересказ…' : 'Получить пересказ'}
          </button>
          <button
            type="button"
            disabled={!canExportReport || exportLoading}
            onClick={async () => {
              if (!activeVersion) return;
              try {
                setExportError(null);
                setExportFormatLoading('pdf');
                const result = await exportReport({
                  documentId: doc.id,
                  versionId: activeVersion.id,
                  format: 'pdf',
                }).unwrap();
                openDownloadUrl(result.url, '_blank');
              } catch (error) {
                setExportError(
                  error instanceof Error ? error.message : 'Не удалось экспортировать отчёт PDF',
                );
              } finally {
                setExportFormatLoading(null);
              }
            }}
            className="w-full cursor-pointer rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-folio-300 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {exportLoading && exportFormatLoading === 'pdf' ? 'Экспорт…' : 'Экспорт отчёта (PDF)'}
          </button>
          <button
            type="button"
            disabled={!canExportReport || exportLoading}
            onClick={async () => {
              if (!activeVersion) return;
              try {
                setExportError(null);
                setExportFormatLoading('word');
                const result = await exportReport({
                  documentId: doc.id,
                  versionId: activeVersion.id,
                  format: 'word',
                }).unwrap();
                openDownloadUrl(result.url, '_self');
              } catch (error) {
                setExportError(
                  error instanceof Error ? error.message : 'Не удалось экспортировать отчёт Word',
                );
              } finally {
                setExportFormatLoading(null);
              }
            }}
            className="w-full cursor-pointer rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-folio-300 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {exportLoading && exportFormatLoading === 'word' ? 'Экспорт…' : 'Экспорт отчёта (Word)'}
          </button>
        </div>
        {summaryError && <p className="mt-3 text-sm text-red-600">{summaryError}</p>}
        {exportError && <p className="mt-3 text-sm text-red-600">{exportError}</p>}
        {summaryText && (
          <div className="mt-4 rounded-xl border border-folio-100 bg-folio-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-900">Пересказ</h3>
              <button
                type="button"
                onClick={() => setIsSummaryExpanded((prev) => !prev)}
                className="cursor-pointer rounded-lg px-2 py-1 text-xs font-medium text-slate-600 hover:bg-folio-100"
              >
                {isSummaryExpanded ? 'Скрыть' : 'Показать'}
              </button>
            </div>
            <div
              className={`grid transition-all duration-300 ease-in-out ${
                isSummaryExpanded ? 'mt-2 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
              }`}
            >
              <div className="overflow-hidden">
                <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{summaryText}</p>
              </div>
            </div>
          </div>
        )}
      </section>

      <div className="mt-6 flex flex-col gap-4 lg:mt-8 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
          {activeVersion?.status === 'processing' && !pdfUrl && (
            <p className="mb-3 text-center text-xs text-slate-500">
              {pdfLoading ? 'Загружаем PDF…' : 'Ожидание worker — PDF появится через несколько секунд'}
            </p>
          )}
          {pdfUrl &&
            activeVersion?.status === 'ready' &&
            (previews?.status === 'partial' ||
              previews?.status === 'processing' ||
              ((previews?.pageCount ?? 0) > 0 &&
                (previews?.pages.length ?? 0) < Math.min(previews?.pageCount ?? 0, 15))) && (
              <p className="mb-3 text-center text-xs text-slate-500">
                Миниатюры: {previews?.pages.length ?? 0}
                {previews?.pageCount ? ` / ${Math.min(previews.pageCount, 15)}` : ''} — PDF уже можно листать
              </p>
            )}
          {previews?.pages && previews.pages.length > 0 && (
            <div className="mb-4 flex gap-2 overflow-x-auto pb-2">
              {previews.pages.map((thumb) => (
                <button
                  key={thumb.page}
                  type="button"
                  onClick={() => setViewerPage(thumb.page)}
                  className={`shrink-0 cursor-pointer overflow-hidden rounded-lg border-2 transition ${
                    viewerPage === thumb.page
                      ? 'border-folio-600 ring-2 ring-folio-200'
                      : 'border-slate-200 hover:border-folio-300'
                  }`}
                >
                  <img
                    src={thumb.url}
                    alt={`Страница ${thumb.page}`}
                    className="h-20 w-auto bg-white object-contain sm:h-24"
                    loading="lazy"
                  />
                </button>
              ))}
            </div>
          )}

          {pdfUrl && (
            <PdfViewerToolbar
              displayMode={viewer.displayMode}
              zoomMode={viewer.zoomMode}
              customScale={viewer.customScale}
              searchQuery={viewer.searchQuery}
              matchCount={viewer.searchMatches.length}
              activeMatchIndex={viewer.activeMatchIndex}
              onDisplayModeChange={(mode: ViewerDisplayMode) => dispatch(setDisplayMode(mode))}
              onZoomIn={() => dispatch(zoomIn())}
              onZoomOut={() => dispatch(zoomOut())}
              onResetZoom={() => dispatch(resetZoom())}
              onSearchChange={(q: string) => dispatch(setSearchQuery(q))}
              onPrevMatch={() => dispatch(prevSearchMatch())}
              onNextMatch={() => dispatch(nextSearchMatch())}
              onClearSearch={() => dispatch(clearSearch())}
            />
          )}

          {pdfLoading && <p className="text-center text-sm text-slate-500">Загрузка PDF…</p>}
          {pdfError && (
            <p className="rounded-lg bg-red-50 p-4 text-center text-sm text-red-700">{pdfError}</p>
          )}
          {!pdfLoading && !pdfError && pdfUrl && (
            <PdfViewer
              url={pdfUrl}
              page={viewerPage}
              onPageChange={setViewerPage}
              displayMode={viewer.displayMode}
              zoomMode={viewer.zoomMode}
              customScale={viewer.customScale}
              searchQuery={viewer.searchQuery}
              activeMatchIndex={viewer.activeMatchIndex}
              onSearchMatches={handleSearchMatches}
            />
          )}
          {!pdfLoading && !pdfError && !pdfUrl && activeVersion?.status !== 'pending_upload' && (
            <p className="text-center text-sm text-slate-500">Нет данных для просмотра</p>
          )}
        </div>

        <div
          className="hidden h-[72vh] w-2 cursor-col-resize rounded bg-slate-200 transition hover:bg-folio-300 lg:block"
          onMouseDown={() => setIsResizingAiPanel(true)}
          role="separator"
          aria-orientation="vertical"
          aria-label="Изменить ширину блока ИИ"
          title="Потяните, чтобы изменить ширину блока ИИ"
        />

        {activeVersion && (
          <aside
            className="w-full lg:sticky lg:top-4 lg:shrink-0"
            style={isDesktop ? { width: `${aiPanelWidth}px` } : undefined}
          >
            <div className="max-h-[65vh] overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:max-h-[72vh] sm:p-4">
              <DocumentAiPanel
                documentId={doc.id}
                versionId={activeVersion.id}
                versionReady={versionReady}
              />
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
