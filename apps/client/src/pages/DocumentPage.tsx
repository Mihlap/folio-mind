import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PdfViewer, PdfViewerToolbar } from '@folio-mind/ui';
import {
  useDeleteDocumentMutation,
  useGetDocumentQuery,
  useGetVersionPreviewsQuery,
  clearSearch,
  nextSearchMatch,
  prevSearchMatch,
  resetZoom,
  setDisplayMode,
  setSearchMatches,
  setSearchQuery,
  zoomIn,
  zoomOut,
} from '@folio-mind/store';
import { DeleteDocumentButton } from '../components/DeleteDocumentButton.js';
import { DocumentAiPanel } from '../components/DocumentAiPanel.js';
import { DocumentVersionsPanel } from '../components/DocumentVersionsPanel.js';
import { useAppDispatch, useAppSelector } from '../hooks.js';
import { loadDocumentPdfUrl } from '../lib/documentPdf.js';

const STATUS_LABEL: Record<string, string> = {
  pending_upload: 'не загружен',
  processing: 'обработка',
  ready: 'готов',
  failed: 'ошибка',
};

export function DocumentPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { id } = useParams<{ id: string }>();
  const token = useAppSelector((s) => s.auth.token);
  const viewer = useAppSelector((s) => s.viewer);
  const { data: doc, isLoading } = useGetDocumentQuery(id!, { skip: !id });
  const [deleteDocument, { isLoading: deleting }] = useDeleteDocumentMutation();
  const [selectedVersionId, setSelectedVersionId] = useState<string | undefined>();
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [viewerPage, setViewerPage] = useState(1);

  const versions = doc?.versions ?? [];
  const latest = versions[0];
  const activeVersion =
    versions.find((v) => v.id === selectedVersionId) ?? latest;

  useEffect(() => {
    if (!doc || selectedVersionId) return;
    if (latest) setSelectedVersionId(latest.id);
  }, [doc?.id, latest?.id, selectedVersionId]);

  useEffect(() => {
    setViewerPage(1);
    dispatch(clearSearch());
  }, [activeVersion?.id, dispatch]);

  const thumbFrom = Math.max(1, viewerPage - 5);
  const thumbTo = viewerPage + 14;
  const [pollPartialPreviews, setPollPartialPreviews] = useState(false);

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
    if (!doc || !activeVersion || activeVersion.status === 'pending_upload') {
      setPdfUrl(null);
      return;
    }

    let objectUrl: string | null = null;
    let cancelled = false;

    setPdfLoading(true);
    setPdfError(null);

    void loadDocumentPdfUrl(doc.id, activeVersion.id, token)
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url;
        setPdfUrl(url);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setPdfError(err instanceof Error ? err.message : 'Не удалось открыть PDF');
        }
      })
      .finally(() => {
        if (!cancelled) setPdfLoading(false);
      });

    return () => {
      cancelled = true;
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
    ? (STATUS_LABEL[activeVersion.status] ?? activeVersion.status)
    : '';
  const deleteConfirm = `Удалить документ «${doc.title}»?\n\nБудут удалены PDF в хранилище и все данные о документе. Пересказ (если был) тоже исчезнет. Восстановить нельзя.`;
  const versionReady = Boolean(activeVersion && activeVersion.status !== 'pending_upload');

  return (
    <div className="p-6 lg:p-8">
      <Link to="/app" className="text-sm text-folio-600 hover:underline">
        ← К документам
      </Link>
      <h1 className="mt-4 text-2xl font-semibold text-slate-900">{doc.title}</h1>
      <p className="mt-1 text-sm text-slate-500">
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

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <DeleteDocumentButton
          title={`Удалить документ «${doc.title}»`}
          variant="page"
          disabled={deleting}
          onClick={async () => {
            if (!window.confirm(deleteConfirm)) return;
            await deleteDocument(doc.id).unwrap();
            navigate('/app');
          }}
        />
      </div>

      {activeVersion && (
        <DocumentAiPanel
          documentId={doc.id}
          documentTitle={doc.title}
          versionId={activeVersion.id}
          versionNumber={activeVersion.version}
          versionReady={versionReady}
        />
      )}

      <div className="mt-8 overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-4">
        {previews?.status === 'processing' && (
          <p className="mb-3 text-center text-xs text-slate-500">Готовим миниатюры страниц…</p>
        )}
        {previews?.status === 'partial' && (
          <p className="mb-3 text-center text-xs text-slate-500">Подгружаем миниатюры…</p>
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
                  className="h-24 w-auto bg-white object-contain"
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
            onDisplayModeChange={(mode) => dispatch(setDisplayMode(mode))}
            onZoomIn={() => dispatch(zoomIn())}
            onZoomOut={() => dispatch(zoomOut())}
            onResetZoom={() => dispatch(resetZoom())}
            onSearchChange={(q) => dispatch(setSearchQuery(q))}
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
    </div>
  );
}
