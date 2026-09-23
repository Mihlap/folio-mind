import { useEffect, useState } from 'react';
import {
  toUserErrorMessage,
  MSG_JOB_NOT_FOUND,
  useExportReportMutation,
  useGetAiProvidersQuery,
  useGetJobQuery,
  useRequestSummaryMutation,
} from '@folio-mind/store';
import {
  clearDocumentSummaryDraft,
  loadDocumentSummaryDraft,
  saveDocumentSummaryDraft,
} from '../../lib/documents/document-summary-draft.js';
import { FeatureHelpButton } from '../ui/FeatureHelp.js';
import {
  reportActionBtnSoft,
  reportIconCirclePdf,
  reportIconCircleWord,
  reportToolbarRowClass,
} from '../ui/FeatureHelp.styles.js';
import { DocumentRagComparePanel } from './DocumentRagComparePanel.js';
import { DocumentExtractPanel } from './DocumentExtractPanel.js';
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
  const [summary, setSummary] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const { data: summaryJob, isError: summaryPollError } = useGetJobQuery(summaryJobId!, {
    skip: !summaryJobId,
    pollingInterval: pollSummary ? 2000 : 0,
  });

  const summaryPending =
    summaryJob?.status === 'queued' ||
    summaryJob?.status === 'processing' ||
    (summaryRequestLoading && !summary);
  const canExportReport = versionReady && Boolean(summary);

  useEffect(() => {
    setSummaryJobId(null);
    setPollSummary(false);
    setSummaryError(null);
    setExportError(null);
    setExportFormatLoading(null);
    const draft = loadDocumentSummaryDraft(versionId);
    if (draft) {
      setSummary(draft.summary);
      setCollapsed(draft.collapsed);
    } else {
      setSummary(null);
      setCollapsed(false);
    }
  }, [versionId]);

  useEffect(() => {
    if (!versionId || !summary) return;
    saveDocumentSummaryDraft(versionId, { summary, collapsed });
  }, [versionId, summary, collapsed]);

  useEffect(() => {
    if (summaryJob?.status === 'completed' || summaryJob?.status === 'failed') {
      setPollSummary(false);
      if (summaryJob.status === 'completed' && summaryJob.payload?.summary) {
        setCollapsed(false);
        setSummary(summaryJob.payload.summary);
      }
      if (summaryJob.status === 'failed') {
        const msg = toUserErrorMessage(
          summaryJob.payload && 'error' in summaryJob.payload
            ? summaryJob.payload.error
            : null,
          'Не удалось получить пересказ',
        );
        setSummaryError(msg);
      }
    }
  }, [summaryJob?.payload, summaryJob?.status]);

  useEffect(() => {
    if (summaryPollError && !summaryJob) {
      setPollSummary(false);
      setSummaryError(MSG_JOB_NOT_FOUND);
    }
  }, [summaryPollError, summaryJob]);

  function handleDismissSummary() {
    setSummaryJobId(null);
    setPollSummary(false);
    setSummary(null);
    setCollapsed(false);
    setSummaryError(null);
    clearDocumentSummaryDraft(versionId);
  }

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
                setSummary(null);
                setCollapsed(false);
                clearDocumentSummaryDraft(versionId);
                const result = await requestSummary({
                  documentId,
                  versionId,
                  provider: providersData?.defaultProvider,
                }).unwrap();
                setSummaryJobId(result.jobId);
                setPollSummary(result.status !== 'completed');
              } catch (error) {
                setSummaryError(toUserErrorMessage(error, 'Не удалось получить пересказ'));
              }
            }}
            className={reportActionBtnSoft}
          >
            {summaryPending ? 'Получаем…' : 'Получить пересказ'}
          </button>
          <FeatureHelpButton title="Пересказ и экспорт отчёта" corner>
            <p>
              <strong className="text-slate-800">Получить пересказ</strong> — ИИ читает текст этой
              версии PDF и показывает краткое содержание договора. Пересказ сохраняется до
              перезагрузки страницы (можно свернуть и вернуться в «Отчёт»). Крестик × удаляет.
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
              setExportError(toUserErrorMessage(error, 'Не удалось экспортировать отчёт PDF'));
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
              setExportError(toUserErrorMessage(error, 'Не удалось экспортировать отчёт Word'));
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
      {summary && (
        <ReportTextBlock
          title="Пересказ"
          collapsible
          expanded={!collapsed}
          onExpandedChange={(next) => setCollapsed(!next)}
          onDismiss={handleDismissSummary}
          dismissLabel="Закрыть и очистить пересказ"
        >
          {summary}
        </ReportTextBlock>
      )}

      <DocumentRagComparePanel
        documentId={documentId}
        versionId={versionId}
        versionReady={versionReady}
      />
      <DocumentExtractPanel
        documentId={documentId}
        versionId={versionId}
        versionReady={versionReady}
      />
    </div>
  );
}
