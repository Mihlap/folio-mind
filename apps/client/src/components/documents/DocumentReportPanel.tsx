import { useEffect, useState } from 'react';
import {
  useExportReportMutation,
  useGetAiProvidersQuery,
  useGetJobQuery,
  useRequestSummaryMutation,
} from '@folio-mind/store';
import { FeatureHelpButton } from '../ui/FeatureHelp.js';
import {
  reportActionBtnSoft,
  reportIconCirclePdf,
  reportIconCircleWord,
  reportToolbarRowClass,
} from '../ui/FeatureHelp.styles.js';
import { DocumentRagComparePanel } from './DocumentRagComparePanel.js';
import { ReportTextBlock } from './ReportTextBlock.js';

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
            className={reportActionBtnSoft}
          >
            {summaryPending ? 'Получаем…' : 'Получить пересказ'}
          </button>
          <FeatureHelpButton title="Пересказ и экспорт отчёта" corner>
            <p>
              <strong className="text-slate-800">Получить пересказ</strong> — ИИ читает текст этой
              версии PDF и показывает краткое содержание договора на вкладке. Кнопка «В окне» или
              клик по тексту откроют пересказ в отдельном изменяемом окне.
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
        <ReportTextBlock
          title="Пересказ"
          collapsible
          onDismiss={() => {
            setSummaryDismissed(true);
            setSummaryJobId(null);
            setPollSummary(false);
            setStoredSummary(null);
            setSummaryError(null);
          }}
          dismissLabel="Закрыть и очистить пересказ"
        >
          {summaryText}
        </ReportTextBlock>
      )}

      <DocumentRagComparePanel
        documentId={documentId}
        versionId={versionId}
        versionReady={versionReady}
      />
    </div>
  );
}
