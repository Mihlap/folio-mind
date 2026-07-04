import { useEffect, useState } from 'react';
import {
  BOOKLET_EXPORT_DEFAULT_JPEG_DPI,
  PRINT_MIN_DPI,
  LABEL_ARCHIVE_PDF,
  LABEL_ARCHIVE_PDF_HINT,
  MSG_ARCHIVE_PDF_FALLBACK,
  useExportBookletMutation,
  useExportPagesMutation,
  useGetJobQuery,
  useLazyGetBookletExportUrlQuery,
  useLazyGetPagesExportUrlQuery,
  usePrintReadinessMutation,
  type PrintReadinessReport,
} from '@folio-mind/store';
import {
  FeatureHelpActionButton,
  FeatureHelpButton,
  reportActionBtnPrimary,
  reportActionsColumnClass,
} from '../ui/FeatureHelp.js';

type Props = {
  documentId: string;
  versionId: string;
  versionReady: boolean;
  pageCount: number;
  viewerPage: number;
};

function levelLabel(level: string): string {
  if (level === 'ok') return 'OK';
  if (level === 'warning') return 'Внимание';
  return 'Проблема';
}

function levelClass(level: string): string {
  if (level === 'ok') return 'text-emerald-700 bg-emerald-50 border-emerald-200';
  if (level === 'warning') return 'text-amber-800 bg-amber-50 border-amber-200';
  return 'text-rose-800 bg-rose-50 border-rose-200';
}

function parsePagesInput(input: string, maxPage: number): number[] | string {
  const parts = input
    .split(/[,;\s]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return 'Укажите номера страниц';
  const pages: number[] = [];
  for (const part of parts) {
    const n = Number(part);
    if (!Number.isInteger(n) || n < 1) return `Некорректный номер: ${part}`;
    if (maxPage > 0 && n > maxPage) return `Страница ${n} больше числа страниц (${maxPage})`;
    if (!pages.includes(n)) pages.push(n);
  }
  return pages.sort((a, b) => a - b);
}

export function DocumentBookletExportPanel({
  documentId,
  versionId,
  versionReady,
  pageCount,
  viewerPage,
}: Props) {
  const [jpegDpi, setJpegDpi] = useState(BOOKLET_EXPORT_DEFAULT_JPEG_DPI);
  const [pdfA, setPdfA] = useState(false);
  const [pagesInput, setPagesInput] = useState(String(viewerPage));
  const [exportFormat, setExportFormat] = useState<'jpeg' | 'png'>('jpeg');
  const [pagesDpi, setPagesDpi] = useState(BOOKLET_EXPORT_DEFAULT_JPEG_DPI);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobKind, setJobKind] = useState<'booklet' | 'pages' | 'readiness' | null>(null);
  const [statusHint, setStatusHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<PrintReadinessReport | null>(null);

  const [exportBooklet, { isLoading: exportingBooklet }] = useExportBookletMutation();
  const [exportPages, { isLoading: exportingPages }] = useExportPagesMutation();
  const [printReadiness, { isLoading: checkingReadiness }] = usePrintReadinessMutation();
  const [fetchBookletUrl] = useLazyGetBookletExportUrlQuery();
  const [fetchPagesUrl] = useLazyGetPagesExportUrlQuery();

  const { data: job } = useGetJobQuery(activeJobId!, {
    skip: !activeJobId,
    pollingInterval: activeJobId ? 2000 : 0,
  });

  useEffect(() => {
    setPagesInput(String(viewerPage));
  }, [viewerPage]);

  useEffect(() => {
    if (!job || !activeJobId) return;
    if (job.status === 'completed') {
      const payload = job.payload as Record<string, unknown> | null;
      if (jobKind === 'readiness' && payload && 'printReadiness' in payload) {
        setReadiness(payload.printReadiness as PrintReadinessReport);
        setStatusHint(String(payload.message ?? 'Чеклист готов.'));
      } else if (jobKind === 'booklet') {
        const fallbackMsg =
          payload?.pdfA === true && payload?.pdfAApplied === false
            ? MSG_ARCHIVE_PDF_FALLBACK
            : null;
        setStatusHint(
          fallbackMsg ?? String(payload?.message ?? 'Пакет готов.'),
        );
        if (payload && 'printReadiness' in payload) {
          setReadiness(payload.printReadiness as PrintReadinessReport);
        }
        void fetchBookletUrl({ documentId, versionId })
          .unwrap()
          .then((result: { url: string }) => {
            window.open(result.url, '_blank', 'noopener,noreferrer');
          })
          .catch(() => {
            setError('Пакет создан, но ссылку скачать не удалось — нажмите «Скачать ZIP».');
          });
      } else if (jobKind === 'pages') {
        setStatusHint(String(payload?.message ?? 'Экспорт страниц готов.'));
        void fetchPagesUrl({ documentId, versionId })
          .unwrap()
          .then((result: { url: string }) => {
            window.open(result.url, '_blank', 'noopener,noreferrer');
          })
          .catch(() => {
            setError('Экспорт создан, но ссылку открыть не удалось.');
          });
      }
      setActiveJobId(null);
      setJobKind(null);
    }
    if (job.status === 'failed') {
      const payload = job.payload as { error?: string } | null;
      setError(payload?.error ?? 'Операция не удалась');
      setActiveJobId(null);
      setJobKind(null);
    }
  }, [job, activeJobId, jobKind, documentId, versionId, fetchBookletUrl, fetchPagesUrl]);

  async function handleExportBooklet() {
    if (!versionReady) return;
    setError(null);
    setStatusHint(null);
    try {
      const result = await exportBooklet({ documentId, versionId, jpegDpi, pdfA }).unwrap();
      setJobKind('booklet');
      setActiveJobId(result.operationJobId);
      setStatusHint('Собираем ZIP: PDF + JPG по страницам…');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось запустить экспорт');
    }
  }

  async function handleExportPages() {
    if (!versionReady) return;
    const parsed = parsePagesInput(pagesInput, pageCount);
    if (typeof parsed === 'string') {
      setError(parsed);
      return;
    }
    setError(null);
    setStatusHint(null);
    try {
      const result = await exportPages({
        documentId,
        versionId,
        pages: parsed,
        format: exportFormat,
        dpi: pagesDpi,
      }).unwrap();
      setJobKind('pages');
      setActiveJobId(result.operationJobId);
      setStatusHint(`Рендер ${parsed.length} стр. в ${exportFormat.toUpperCase()}…`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось экспортировать страницы');
    }
  }

  async function handlePrintReadiness() {
    if (!versionReady) return;
    setError(null);
    setStatusHint(null);
    try {
      const result = await printReadiness({ documentId, versionId }).unwrap();
      setJobKind('readiness');
      setActiveJobId(result.operationJobId);
      setStatusHint('Проверяем DPI и шрифты…');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось запустить проверку');
    }
  }

  async function handleDownloadBooklet() {
    setError(null);
    try {
      const result = await fetchBookletUrl({ documentId, versionId }).unwrap();
      window.open(result.url, '_blank', 'noopener,noreferrer');
    } catch {
      setError('Пакет ещё не готов — сначала соберите ZIP.');
    }
  }

  const busy = exportingBooklet || exportingPages || checkingReadiness || Boolean(activeJobId);

  return (
    <div className="space-y-4 text-sm text-slate-700">
      <p className="text-xs text-slate-500">
        Пакет для заказчика: PDF + JPG всех страниц в одном ZIP. Отдельно — выбранные страницы без полного PDF.
      </p>

      <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-800">Пакет PDF + JPG</span>
          <FeatureHelpButton title="Экспорт буклета">
            <p>ZIP содержит document.pdf, папку pages/ с JPG и print-readiness.json.</p>
            <p>Одна presigned-ссылка — можно переслать заказчику.</p>
          </FeatureHelpButton>
        </div>
        <label className="flex items-center gap-2 text-xs">
          JPG, dpi
          <input
            type="number"
            min={72}
            max={600}
            value={jpegDpi}
            disabled={busy || !versionReady}
            onChange={(e) => setJpegDpi(Number(e.target.value) || BOOKLET_EXPORT_DEFAULT_JPEG_DPI)}
            className="w-20 rounded border border-slate-200 px-2 py-1"
          />
        </label>
        <label className="flex items-start gap-2 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={pdfA}
            disabled={busy || !versionReady}
            onChange={(e) => setPdfA(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium text-slate-700">{LABEL_ARCHIVE_PDF}</span>
            <span className="mt-0.5 block text-[11px] leading-snug text-slate-400">
              {LABEL_ARCHIVE_PDF_HINT}
            </span>
          </span>
        </label>
        <div className={reportActionsColumnClass}>
          <FeatureHelpActionButton
            helpTitle="Собрать ZIP"
            helpContent={<p>PDF + JPG каждой страницы + отчёт print-readiness.json</p>}
            disabled={!versionReady || busy}
            onClick={() => void handleExportBooklet()}
            buttonClassName={reportActionBtnPrimary}
          >
            {exportingBooklet || (activeJobId && jobKind === 'booklet') ? 'Сборка…' : 'Собрать ZIP для заказчика'}
          </FeatureHelpActionButton>
          <button
            type="button"
            disabled={!versionReady || busy}
            onClick={() => void handleDownloadBooklet()}
            className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            Скачать последний ZIP
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-3 space-y-2">
        <span className="text-xs font-medium text-slate-800">Страницы в PNG/JPG</span>
        <label className="block text-xs text-slate-600">
          Номера (через запятую)
          <input
            type="text"
            value={pagesInput}
            disabled={busy || !versionReady}
            onChange={(e) => setPagesInput(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            placeholder="1, 3, 5"
          />
        </label>
        <div className="flex flex-wrap gap-3 text-xs">
          <label className="flex items-center gap-1">
            Формат
            <select
              value={exportFormat}
              disabled={busy || !versionReady}
              onChange={(e) => setExportFormat(e.target.value as 'jpeg' | 'png')}
              className="rounded border border-slate-200 px-2 py-1"
            >
              <option value="jpeg">JPG</option>
              <option value="png">PNG</option>
            </select>
          </label>
          <label className="flex items-center gap-1">
            dpi
            <input
              type="number"
              min={72}
              max={600}
              value={pagesDpi}
              disabled={busy || !versionReady}
              onChange={(e) => setPagesDpi(Number(e.target.value) || BOOKLET_EXPORT_DEFAULT_JPEG_DPI)}
              className="w-20 rounded border border-slate-200 px-2 py-1"
            />
          </label>
        </div>
        <FeatureHelpActionButton
          helpTitle="Экспорт страниц"
          helpContent={<p>ZIP только с выбранными страницами в JPG или PNG.</p>}
          disabled={!versionReady || busy}
          onClick={() => void handleExportPages()}
          buttonClassName={reportActionBtnPrimary}
        >
          {exportingPages || (activeJobId && jobKind === 'pages') ? 'Экспорт…' : 'Экспорт выбранных страниц'}
        </FeatureHelpActionButton>
      </div>

      <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-800">Чеклист перед печатью</span>
          <FeatureHelpButton title="DPI и шрифты">
            <p>Оценка DPI растра (эвристика по PDF) и наличия встроенных шрифтов.</p>
            <p>Ориентир: ≥ {PRINT_MIN_DPI} dpi для печати A4.</p>
          </FeatureHelpButton>
        </div>
        <FeatureHelpActionButton
          helpTitle="Проверить"
          helpContent={<p>Эвристика по встроенным шрифтам и растровым объектам в PDF.</p>}
          disabled={!versionReady || busy}
          onClick={() => void handlePrintReadiness()}
          buttonClassName={reportActionBtnPrimary}
        >
          {checkingReadiness || (activeJobId && jobKind === 'readiness') ? 'Проверка…' : 'Проверить перед печатью'}
        </FeatureHelpActionButton>
        {readiness && (
          <div className="space-y-2 text-xs">
            <p
              className={[
                'inline-flex rounded-full border px-2 py-0.5 font-medium',
                levelClass(readiness.overallLevel),
              ].join(' ')}
            >
              Итого: {levelLabel(readiness.overallLevel)}
            </p>
            <p className="text-slate-600">{readiness.fonts.note}</p>
            {readiness.warnings.length > 0 && (
              <ul className="list-disc space-y-0.5 pl-4 text-amber-800">
                {readiness.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
            <ul className="max-h-40 space-y-1 overflow-y-auto">
              {readiness.pages.map((page) => (
                <li key={page.page} className="flex justify-between gap-2 border-b border-slate-100 pb-1">
                  <span>Стр. {page.page}</span>
                  <span className={levelClass(page.level).split(' ')[0]}>
                    {page.minEstimatedDpi != null ? `${page.minEstimatedDpi} dpi` : '—'} ·{' '}
                    {levelLabel(page.level)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {statusHint && <p className="text-xs text-slate-600">{statusHint}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
