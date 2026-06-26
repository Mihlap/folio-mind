import { useEffect, useState } from 'react';
import {
  useExportReportMutation,
  useGetAiProvidersQuery,
  useGetJobQuery,
  useRequestSummaryMutation,
} from '@folio-mind/store';
import {
  FeatureHelpButton,
  reportActionBtnPrimary,
  reportIconCirclePdf,
  reportIconCircleWord,
  reportToolbarRowClass,
} from '../ui/FeatureHelp.js';
import { DocumentAiSuggestionsPanel } from './DocumentAiSuggestionsPanel.js';
import { DocumentRagComparePanel } from './DocumentRagComparePanel.js';
function openDownloadUrl(url: string, target: '_self' | '_blank' = '_self') {
  if (target === '_blank') {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  window.location.assign(url);
}
type Props = {
  documentId: string;
  versionId: string;
  versionReady: boolean;
  onGoToPage: (page: number) => void;
  onSelectVersion: (versionId: string) => void;
};
export function DocumentReportPanel({
  documentId,
  versionId,
  versionReady,
  onGoToPage,
  onSelectVersion,
}: Props) {
  const { data: providersData } = useGetAiProvidersQuery();
  const [requestSummary, { isLoading: summaryRequestLoading }] = useRequestSummaryMutation();
  const [exportReport, { isLoading: exportLoading }] = useExportReportMutation();
  const [summaryJobId, setSummaryJobId] = useState<string | null>(null);
  const [pollSummary, setPollSummary] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportFormatLoading, setExportFormatLoading] = useState<'pdf' | 'word' | null>(null);
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(true);
  const [storedSummary, setStoredSummary] = useState<string | null>(null);
  const [summaryDismissed, setSummaryDismissed] = useState(false);
  const { data: summaryJob } = useGetJobQuery(summaryJobId!, {
    skip: !summaryJobId,
    pollingInterval: pollSummary ? 2000 : 0,
  });
  const summaryFromJob =
    summaryJobId && summaryJob?.status === 'completed'
      ? (summaryJob.payload?.summary ?? null)
      : null;
  const summaryText = summaryDismissed ? null : (storedSummary ?? summaryFromJob);
  const summaryPending =
    summaryJob?.status === 'queued' ||
    summaryJob?.status === 'processing' ||
    (summaryRequestLoading && !summaryText);
  const canExportReport = versionReady && Boolean(summaryText);
  useEffect(() => {
    setSummaryJobId(null);
    setPollSummary(false);
    setSummaryError(null);
    setExportError(null);
    setExportFormatLoading(null);
    setIsSummaryExpanded(true);
    setStoredSummary(null);
    setSummaryDismissed(false);
  }, [versionId]);
  useEffect(() => {
    if (summaryJob?.status === 'completed' || summaryJob?.status === 'failed') {
      setPollSummary(false);
      if (summaryJob.status === 'completed' && summaryJob.payload?.summary) {
        setSummaryDismissed(false);
        setStoredSummary(summaryJob.payload.summary);
      }
      if (summaryJob.status === 'failed') {
        const msg =
          typeof summaryJob.payload === 'object' &&
          summaryJob.payload &&
          'error' in summaryJob.payload
            ? String(
                (
                  summaryJob.payload as {
                    error?: string;
                  }
                ).error ?? 'Не удалось получить пересказ',
              )
            : 'Не удалось получить пересказ';
        setSummaryError(msg);
      }
    }
  }, [summaryJob?.payload, summaryJob?.status]);
  return (
    <div className="space-y-3 p-3 sm:p-4">
      <p className="text-[11px] leading-snug text-slate-500">
        Пересказ и отчёт относятся к выбранной версии документа.
      </p>
      <div className={reportToolbarRowClass}>
        <div className="inline-flex items-center gap-2">
          <button
            type="button"
            disabled={!versionReady || summaryPending}
            onClick={async () => {
              try {
                setSummaryError(null);
                setSummaryDismissed(false);
                setStoredSummary(null);
                const result = await requestSummary({
                  documentId,
                  versionId,
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
            className={reportActionBtnPrimary}
          >
            {summaryPending ? 'Получаем…' : 'Получить пересказ'}
          </button>
          <FeatureHelpButton title="Пересказ и экспорт отчёта" corner>
            <p>
              <strong className="text-slate-800">Получить пересказ</strong> — ИИ читает текст этой
              версии PDF и показывает краткое содержание договора на вкладке. Закрыть текст можно
              крестиком × в блоке «Пересказ».
            </p>
            <p>
              <strong className="text-slate-800">PDF</strong> — скачивает файл отчёта с пересказом
              (доступно после получения пересказа). Откроется в новой вкладке браузера.
            </p>
            <p>
              <strong className="text-slate-800">W</strong> — то же в формате Word (.docx) для
              правок в редакторе.
            </p>
          </FeatureHelpButton>
        </div>

        <button
          type="button"
          title="Скачать отчёт с пересказом в PDF"
          aria-label="Экспорт отчёта в PDF"
          disabled={!canExportReport || exportLoading}
          onClick={async () => {
            try {
              setExportError(null);
              setExportFormatLoading('pdf');
              const result = await exportReport({
                documentId,
                versionId,
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
          className={reportIconCirclePdf}
        >
          {exportLoading && exportFormatLoading === 'pdf' ? '…' : 'PDF'}
        </button>

        <button
          type="button"
          title="Скачать отчёт с пересказом в Word"
          aria-label="Экспорт отчёта в Word"
          disabled={!canExportReport || exportLoading}
          onClick={async () => {
            try {
              setExportError(null);
              setExportFormatLoading('word');
              const result = await exportReport({
                documentId,
                versionId,
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
          className={reportIconCircleWord}
        >
          {exportLoading && exportFormatLoading === 'word' ? '…' : 'W'}
        </button>
      </div>
      {summaryError && <p className="text-sm text-red-600">{summaryError}</p>}
      {exportError && <p className="text-sm text-red-600">{exportError}</p>}
      {summaryText && (
        <div className="rounded-xl border border-folio-100 bg-folio-50 p-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">Пересказ</h3>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setIsSummaryExpanded((prev) => !prev)}
                className="cursor-pointer rounded px-2 py-0.5 text-xs text-slate-600 hover:bg-folio-100"
              >
                {isSummaryExpanded ? 'Свернуть' : 'Развернуть'}
              </button>
              <button
                type="button"
                title="Закрыть и очистить пересказ"
                aria-label="Закрыть и очистить пересказ"
                onClick={() => {
                  setSummaryDismissed(true);
                  setSummaryJobId(null);
                  setPollSummary(false);
                  setStoredSummary(null);
                  setSummaryError(null);
                  setIsSummaryExpanded(true);
                }}
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-lg text-slate-400 hover:bg-folio-100 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
          </div>
          {isSummaryExpanded && (
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
              {summaryText}
            </p>
          )}
        </div>
      )}

      <DocumentAiSuggestionsPanel
        documentId={documentId}
        versionId={versionId}
        versionReady={versionReady}
        onGoToPage={onGoToPage}
        onSelectVersion={onSelectVersion}
      />

      <DocumentRagComparePanel
        documentId={documentId}
        versionId={versionId}
        versionReady={versionReady}
      />
    </div>
  );
}
