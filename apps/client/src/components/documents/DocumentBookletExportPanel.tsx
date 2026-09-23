import { useEffect, useState } from 'react';
import {
  BOOKLET_EXPORT_DEFAULT_JPEG_DPI,
  PRINT_MIN_DPI,
  LABEL_ARCHIVE_PDF,
  LABEL_ARCHIVE_PDF_HINT,
  MSG_ARCHIVE_PDF_FALLBACK,
  toUserErrorMessage,
  MSG_JOB_NOT_FOUND,
  useExportBookletMutation,
  useExportPagesMutation,
  useGetJobQuery,
  useLazyGetBookletExportUrlQuery,
  useLazyGetPagesExportUrlQuery,
  usePrintReadinessMutation,
  type PrintReadinessReport,
} from '@folio-mind/store';
import { FeatureHelpActionButton, FeatureHelpButton } from '../ui/FeatureHelp.js';
import { reportActionBtnPrimary, reportActionsColumnClass } from '../ui/FeatureHelp.styles.js';
import { BookletStepHeading } from './BookletStepHeading.js';

type Props = {
  documentId: string;
  versionId: string;
  versionReady: boolean;
  pageCount: number;
  viewerPage: number;
  compact?: boolean;
};

function levelLabel(level: string): string {
  if (level === 'ok') return 'Готово';
  if (level === 'warning') return 'Внимание';
  return 'Стоит проверить';
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
  if (parts.length === 0) return 'Укажите номера страниц через запятую, например: 1, 3, 5';
  const pages: number[] = [];
  for (const part of parts) {
    const n = Number(part);
    if (!Number.isInteger(n) || n < 1) return `Некорректный номер страницы: «${part}»`;
    if (maxPage > 0 && n > maxPage) {
      return `Страницы ${n} нет в документе (всего ${maxPage} стр.)`;
    }
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
  compact = false,
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

  useEffect(() => {
    setPagesInput(String(viewerPage));
  }, [viewerPage]);

  useEffect(() => {
    if (!job || !activeJobId) return;
    if (job.status === 'completed') {
      const payload = job.payload as Record<string, unknown> | null;
      if (jobKind === 'readiness' && payload && 'printReadiness' in payload) {
        setReadiness(payload.printReadiness as PrintReadinessReport);
        setStatusHint(String(payload.message ?? 'Проверка завершена.'));
      } else if (jobKind === 'booklet') {
        const fallbackMsg =
          payload?.pdfA === true && payload?.pdfAApplied === false
            ? MSG_ARCHIVE_PDF_FALLBACK
            : null;
        setStatusHint(fallbackMsg ?? String(payload?.message ?? 'Пакет готов.'));
        if (payload && 'printReadiness' in payload) {
          setReadiness(payload.printReadiness as PrintReadinessReport);
        }
        void fetchBookletUrl({ documentId, versionId })
          .unwrap()
          .then((result: { url: string }) => {
            window.open(result.url, '_blank', 'noopener,noreferrer');
          })
          .catch(() => {
            setError('Пакет собран, но ссылку открыть не удалось — нажмите «Скачать ZIP».');
          });
      } else if (jobKind === 'pages') {
        setStatusHint(String(payload?.message ?? 'Картинки выбранных страниц готовы.'));
        void fetchPagesUrl({ documentId, versionId })
          .unwrap()
          .then((result: { url: string }) => {
            window.open(result.url, '_blank', 'noopener,noreferrer');
          })
          .catch(() => {
            setError('Экспорт готов, но ссылку открыть не удалось — попробуйте ещё раз.');
          });
      }
      setActiveJobId(null);
      setJobKind(null);
    }
    if (job.status === 'failed') {
      const payload = job.payload as { error?: string } | null;
      setError(toUserErrorMessage(payload?.error, 'Не удалось выполнить операцию. Попробуйте ещё раз.'));
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
      setStatusHint('Собираем ZIP: PDF и JPG по каждой странице…');
    } catch (err) {
      setError(toUserErrorMessage(err, 'Не удалось запустить сборку пакета'));
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
      setStatusHint(`Готовим ${parsed.length} стр. в ${exportFormat.toUpperCase()}…`);
    } catch (err) {
      setError(toUserErrorMessage(err, 'Не удалось экспортировать страницы'));
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
      setStatusHint('Проверяем качество картинок и шрифты…');
    } catch (err) {
      setError(toUserErrorMessage(err, 'Не удалось запустить проверку'));
    }
  }

  async function handleDownloadBooklet() {
    setError(null);
    try {
      const result = await fetchBookletUrl({ documentId, versionId }).unwrap();
      window.open(result.url, '_blank', 'noopener,noreferrer');
    } catch {
      setError('Пакет ещё не собран — сначала нажмите «Собрать ZIP для заказчика».');
    }
  }

  const busy = exportingBooklet || exportingPages || checkingReadiness || Boolean(activeJobId);

  const readinessBlock = (
    <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-slate-800">Чеклист перед печатью</span>
        <FeatureHelpButton title="Проверка перед печатью">
          <p>Оценка резкости картинок (DPI) и того, встроены ли шрифты в PDF.</p>
          <p>
            Это подсказка, не гарантия типографии. Ориентир для печати A4: от {PRINT_MIN_DPI} dpi.
          </p>
        </FeatureHelpButton>
      </div>
      <p className="text-[11px] leading-snug text-slate-500">
        Автоматическая оценка по PDF. «Стоит проверить» не значит, что печать невозможна — откройте
        файл и посмотрите глазами.
      </p>
      <FeatureHelpActionButton
        helpTitle="Проверить"
        helpContent={<p>Краткий отчёт по страницам: DPI картинок и шрифты.</p>}
        disabled={!versionReady || busy}
        onClick={() => void handlePrintReadiness()}
        buttonClassName={reportActionBtnPrimary}
      >
        {checkingReadiness || (activeJobId && jobKind === 'readiness')
          ? 'Проверка…'
          : 'Проверить перед печатью'}
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
              <li
                key={page.page}
                className="flex justify-between gap-2 border-b border-slate-100 pb-1"
              >
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
  );

  const packageBlock = (
    <>
      <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-800">ZIP: PDF + JPG всех страниц</span>
          <FeatureHelpButton title="Пакет для заказчика">
            <p>
              В архиве: PDF документа, папка pages/ с JPG каждой страницы и отчёт о готовности к
              печати.
            </p>
            <p>После сборки можно дать ссылку клиенту в разделе «Ссылка для заказчика».</p>
          </FeatureHelpButton>
        </div>
        <label className="flex items-center gap-2 text-xs">
          Качество JPG, dpi
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
            helpContent={<p>PDF + JPG каждой страницы + отчёт о готовности к печати.</p>}
            disabled={!versionReady || busy}
            onClick={() => void handleExportBooklet()}
            buttonClassName={reportActionBtnPrimary}
          >
            {exportingBooklet || (activeJobId && jobKind === 'booklet')
              ? 'Сборка…'
              : 'Собрать ZIP для заказчика'}
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
        <span className="text-xs font-medium text-slate-800">Отдельные страницы (JPG или PNG)</span>
        <p className="text-[11px] leading-snug text-slate-500">
          Без полного PDF — только выбранные листы в архиве.
        </p>
        <label className="block text-xs text-slate-600">
          Номера страниц
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
              onChange={(e) =>
                setPagesDpi(Number(e.target.value) || BOOKLET_EXPORT_DEFAULT_JPEG_DPI)
              }
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
          {exportingPages || (activeJobId && jobKind === 'pages')
            ? 'Экспорт…'
            : 'Экспорт выбранных страниц'}
        </FeatureHelpActionButton>
      </div>
    </>
  );

  return (
    <div className="space-y-4 text-sm text-slate-700">
      {!compact && (
        <p className="text-xs text-slate-500">
          Проверка качества, ZIP с PDF и JPG, экспорт отдельных страниц.
        </p>
      )}

      {compact ? (
        <>
          <section className="space-y-3 border-t border-slate-100 pt-4">
            <BookletStepHeading step={2} title="Проверка перед печатью" />
            {readinessBlock}
          </section>
          <section className="space-y-3 border-t border-slate-100 pt-4">
            <BookletStepHeading step={3} title="Пакет для заказчика" />
            <div className="space-y-4">{packageBlock}</div>
          </section>
        </>
      ) : (
        <>
          {readinessBlock}
          {packageBlock}
        </>
      )}

      {statusHint && <p className="text-xs text-slate-600">{statusHint}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
