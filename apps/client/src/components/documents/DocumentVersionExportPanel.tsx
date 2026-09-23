import { useEffect, useState } from 'react';
import {
  BOOKLET_EXPORT_DEFAULT_JPEG_DPI,
  toUserErrorMessage,
  MSG_JOB_NOT_FOUND,
  useConvertPdfToDocxMutation,
  useExportBookletMutation,
  useExportPagesMutation,
  useGetJobQuery,
  useLazyGetBookletExportUrlQuery,
  useLazyGetConvertedDocxUrlQuery,
  useLazyGetPagesExportUrlQuery,
  useLazyGetSourceDocxUrlQuery,
} from '@folio-mind/store';
import { useAppSelector } from '../../hooks/index.js';
import { downloadDocumentPdf } from '../../lib/documents/documentPdf.js';
import {
  docxDownloadLabel,
  hasUserSourceDocx,
  versionHasDocxDownload,
  type VersionDocxInfo,
} from '../../lib/documents/sourceDocx.js';
import { FeatureHelpButton } from '../ui/FeatureHelp.js';
import { DownloadIcon } from '../ui/icons/DownloadIcon.js';

type VersionInfo = VersionDocxInfo & {
  id: string;
  version: number;
  status: string;
  pageCount?: number | null;
};

type Props = {
  documentId: string;
  version: VersionInfo;
  versionReady: boolean;
};

const actionBtn =
  'inline-flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs font-medium text-slate-800 shadow-sm transition hover:border-folio-300 hover:bg-folio-50 disabled:cursor-not-allowed disabled:opacity-50';

export function DocumentVersionExportPanel({ documentId, version, versionReady }: Props) {
  const token = useAppSelector((s) => s.auth.token);
  const [error, setError] = useState<string | null>(null);
  const [statusHint, setStatusHint] = useState<string | null>(null);
  const [imageFormat, setImageFormat] = useState<'jpeg' | 'png'>('jpeg');
  const [imageDpi, setImageDpi] = useState(BOOKLET_EXPORT_DEFAULT_JPEG_DPI);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobKind, setJobKind] = useState<'convert' | 'pages' | 'booklet' | null>(null);

  const [convertPdfToDocx, { isLoading: converting }] = useConvertPdfToDocxMutation();
  const [exportPages, { isLoading: exportingPages }] = useExportPagesMutation();
  const [exportBooklet, { isLoading: exportingBooklet }] = useExportBookletMutation();
  const [fetchSourceDocx] = useLazyGetSourceDocxUrlQuery();
  const [fetchConvertedDocx] = useLazyGetConvertedDocxUrlQuery();
  const [fetchPagesUrl] = useLazyGetPagesExportUrlQuery();
  const [fetchBookletUrl] = useLazyGetBookletExportUrlQuery();

  const { data: job, isError: pollError } = useGetJobQuery(activeJobId!, {
    skip: !activeJobId,
    pollingInterval: activeJobId ? 2000 : 0,
  });

  useEffect(() => {
    if (pollError && !job && activeJobId) {
      setError(MSG_JOB_NOT_FOUND);
      setActiveJobId(null);
      setJobKind(null);
    }
  }, [pollError, job, activeJobId]);

  const busy = converting || exportingPages || exportingBooklet || Boolean(activeJobId);
  const pageCount = version.pageCount ?? 0;
  const allPages =
    pageCount > 0 ? Array.from({ length: pageCount }, (_, index) => index + 1) : [];

  useEffect(() => {
    if (!job || !activeJobId) return;
    if (job.status === 'completed') {
      const payload = job.payload as Record<string, unknown> | null;
      if (jobKind === 'convert') {
        setStatusHint(String(payload?.message ?? 'DOCX готов.'));
        void fetchConvertedDocx({ documentId, versionId: version.id })
          .unwrap()
          .then((result) => {
            window.open(result.url, '_blank', 'noopener,noreferrer');
          })
          .catch(() => {
            setError('DOCX готов, но ссылку открыть не удалось — попробуйте ещё раз.');
          });
      } else if (jobKind === 'pages') {
        setStatusHint(String(payload?.message ?? 'Картинки страниц готовы.'));
        void fetchPagesUrl({ documentId, versionId: version.id })
          .unwrap()
          .then((result) => {
            window.open(result.url, '_blank', 'noopener,noreferrer');
          })
          .catch(() => {
            setError('Экспорт готов, но ссылку открыть не удалось.');
          });
      } else if (jobKind === 'booklet') {
        setStatusHint(String(payload?.message ?? 'ZIP-пакет готов.'));
        void fetchBookletUrl({ documentId, versionId: version.id })
          .unwrap()
          .then((result) => {
            window.open(result.url, '_blank', 'noopener,noreferrer');
          })
          .catch(() => {
            setError('Пакет готов, но ссылку открыть не удалось.');
          });
      }
      setActiveJobId(null);
      setJobKind(null);
    }
    if (job.status === 'failed') {
      const payload = job.payload as { error?: string } | null;
      setError(toUserErrorMessage(payload?.error, 'Не удалось выполнить операцию.'));
      setActiveJobId(null);
      setJobKind(null);
    }
  }, [
    job,
    activeJobId,
    jobKind,
    documentId,
    version.id,
    fetchConvertedDocx,
    fetchPagesUrl,
    fetchBookletUrl,
  ]);

  async function handlePdfDownload() {
    if (!versionReady) return;
    setError(null);
    try {
      await downloadDocumentPdf(documentId, version.id, `v${version.version}.pdf`, token);
    } catch {
      setError('Не удалось скачать PDF');
    }
  }

  async function openDocxUrl(fetcher: typeof fetchSourceDocx) {
    const { url } = await fetcher({ documentId, versionId: version.id }).unwrap();
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function handleSourceDocxDownload() {
    if (!versionHasDocxDownload(version)) return;
    setError(null);
    try {
      await openDocxUrl(fetchSourceDocx);
    } catch {
      setError('Не удалось скачать DOCX');
    }
  }

  async function handleConvertedDocxDownload() {
    if (!versionReady) return;
    setError(null);
    setStatusHint(null);
    try {
      await openDocxUrl(fetchConvertedDocx);
    } catch {
      try {
        const result = await convertPdfToDocx({ documentId, versionId: version.id }).unwrap();
        if ('operationJobId' in result) {
          setJobKind('convert');
          setActiveJobId(result.operationJobId);
          setStatusHint('Конвертируем PDF в DOCX…');
          return;
        }
        await openDocxUrl(fetchConvertedDocx);
      } catch (err) {
        setError(toUserErrorMessage(err, 'Не удалось конвертировать PDF в DOCX'));
      }
    }
  }

  async function handleExportAllPages() {
    if (!versionReady || allPages.length === 0) return;
    setError(null);
    setStatusHint(null);
    try {
      const result = await exportPages({
        documentId,
        versionId: version.id,
        pages: allPages,
        format: imageFormat,
        dpi: imageDpi,
      }).unwrap();
      setJobKind('pages');
      setActiveJobId(result.operationJobId);
      setStatusHint(`Готовим ${allPages.length} стр. в ${imageFormat.toUpperCase()}…`);
    } catch (err) {
      setError(toUserErrorMessage(err, 'Не удалось экспортировать страницы'));
    }
  }

  async function handleExportBooklet() {
    if (!versionReady) return;
    setError(null);
    setStatusHint(null);
    try {
      const result = await exportBooklet({
        documentId,
        versionId: version.id,
        jpegDpi: imageDpi,
      }).unwrap();
      setJobKind('booklet');
      setActiveJobId(result.operationJobId);
      setStatusHint('Собираем ZIP: PDF и JPG по каждой странице…');
    } catch (err) {
      setError(toUserErrorMessage(err, 'Не удалось собрать ZIP-пакет'));
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <p className="text-xs font-medium text-slate-800">
          Экспорт версии v{version.version}
        </p>
        <FeatureHelpButton title="Экспорт и конвертация">
          <p>Скачайте текущую версию в нужном формате или конвертируйте PDF в Word.</p>
          <p>
            DOCX «из PDF» — автоматическая конвертация для правок; качество ниже, чем у исходного
            Word, загруженного при создании версии.
          </p>
        </FeatureHelpButton>
      </div>

      <div className="space-y-2">
        <button
          type="button"
          className={actionBtn}
          disabled={!versionReady || busy}
          onClick={() => void handlePdfDownload()}
        >
          <span>Скачать PDF</span>
          <DownloadIcon className="h-3.5 w-3.5 shrink-0" />
        </button>

        {versionHasDocxDownload(version) && (
          <button
            type="button"
            className={actionBtn}
            disabled={busy}
            onClick={() => void handleSourceDocxDownload()}
          >
            <span>Скачать {docxDownloadLabel(version)}</span>
            <DownloadIcon className="h-3.5 w-3.5 shrink-0" />
          </button>
        )}

        {versionReady && !hasUserSourceDocx(version.sourceDocxKey) && (
          <button
            type="button"
            className={actionBtn}
            disabled={busy}
            onClick={() => void handleConvertedDocxDownload()}
          >
            <span>{converting || jobKind === 'convert' ? 'Конвертация…' : 'DOCX из PDF'}</span>
            <DownloadIcon className="h-3.5 w-3.5 shrink-0" />
          </button>
        )}
      </div>

      <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-3 space-y-2">
        <p className="text-[11px] font-medium text-slate-700">Страницы как картинки</p>
        <div className="flex flex-wrap gap-2">
          <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
            <span>Формат</span>
            <select
              value={imageFormat}
              onChange={(e) => setImageFormat(e.target.value as 'jpeg' | 'png')}
              className="rounded border border-slate-200 bg-white px-1.5 py-1 text-[11px]"
            >
              <option value="jpeg">JPEG</option>
              <option value="png">PNG</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
            <span>DPI</span>
            <input
              type="number"
              min={72}
              max={600}
              value={imageDpi}
              onChange={(e) => setImageDpi(Number(e.target.value) || BOOKLET_EXPORT_DEFAULT_JPEG_DPI)}
              className="w-16 rounded border border-slate-200 bg-white px-1.5 py-1 text-[11px]"
            />
          </label>
        </div>
        <button
          type="button"
          className={actionBtn}
          disabled={!versionReady || busy || allPages.length === 0}
          onClick={() => void handleExportAllPages()}
        >
          <span>
            {exportingPages || jobKind === 'pages'
              ? 'Экспорт страниц…'
              : `Все страницы в ${imageFormat.toUpperCase()} (ZIP)`}
          </span>
          <DownloadIcon className="h-3.5 w-3.5 shrink-0" />
        </button>
      </div>

      <button
        type="button"
        className={actionBtn}
        disabled={!versionReady || busy}
        onClick={() => void handleExportBooklet()}
      >
        <span>{exportingBooklet || jobKind === 'booklet' ? 'Сборка ZIP…' : 'ZIP: PDF + JPG всех страниц'}</span>
        <DownloadIcon className="h-3.5 w-3.5 shrink-0" />
      </button>

      {statusHint && <p className="text-[11px] text-slate-500">{statusHint}</p>}
      {error && <p className="text-[11px] text-red-600">{error}</p>}
      {!versionReady && (
        <p className="text-[11px] text-slate-400">Дождитесь статуса «готова» у выбранной версии.</p>
      )}
    </div>
  );
}
