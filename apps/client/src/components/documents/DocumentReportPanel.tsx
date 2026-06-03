import { useEffect, useState } from 'react';
import {
  useExportReportMutation,
  useGetAiProvidersQuery,
  useGetJobQuery,
  useRequestSummaryMutation,
} from '@folio-mind/store';

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
};

export function DocumentReportPanel({ documentId, versionId, versionReady }: Props) {
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

  const { data: summaryJob } = useGetJobQuery(summaryJobId!, {
    skip: !summaryJobId,
    pollingInterval: pollSummary ? 2000 : 0,
  });

  const summaryFromJob =
    summaryJob?.status === 'completed' ? (summaryJob.payload?.summary ?? null) : null;
  const summaryText = storedSummary ?? summaryFromJob;
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
  }, [versionId]);

  useEffect(() => {
    if (summaryJob?.status === 'completed' || summaryJob?.status === 'failed') {
      setPollSummary(false);
      if (summaryJob.status === 'completed' && summaryJob.payload?.summary) {
        setStoredSummary(summaryJob.payload.summary);
      }
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

  return (
    <div className="space-y-4 p-4">
      <p className="text-xs text-slate-500">
        Пересказ и отчёт относятся к выбранной версии документа.
      </p>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled={!versionReady || summaryPending}
          onClick={async () => {
            try {
              setSummaryError(null);
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
          className="w-full cursor-pointer rounded-lg bg-folio-600 px-4 py-2 text-sm font-medium text-white hover:bg-folio-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {summaryPending ? 'Получаем пересказ…' : 'Получить пересказ'}
        </button>
        <button
          type="button"
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
          className="w-full cursor-pointer rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-folio-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {exportLoading && exportFormatLoading === 'pdf' ? 'Экспорт…' : 'Экспорт отчёта (PDF)'}
        </button>
        <button
          type="button"
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
          className="w-full cursor-pointer rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-folio-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {exportLoading && exportFormatLoading === 'word' ? 'Экспорт…' : 'Экспорт отчёта (Word)'}
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
                {isSummaryExpanded ? 'Скрыть' : 'Показать'}
              </button>
              <button
                type="button"
                title="Очистить пересказ"
                onClick={() => {
                  setSummaryJobId(null);
                  setPollSummary(false);
                  setStoredSummary(null);
                  setSummaryError(null);
                }}
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-slate-400 hover:bg-folio-100 hover:text-slate-600"
              >
                ×
              </button>
            </div>
          </div>
          {isSummaryExpanded && (
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{summaryText}</p>
          )}
        </div>
      )}
    </div>
  );
}
