import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useGetJobQuery, useRequestRagCompareMutation } from '@folio-mind/store';
import { FeatureHelpActionButton, PanelSectionHeader } from '../ui/FeatureHelp.js';
import { reportActionBtnSoft, reportActionsColumnClass } from '../ui/FeatureHelp.styles.js';
import { ReportTextBlock } from './ReportTextBlock.js';
type Props = {
  documentId: string;
  versionId: string;
  versionReady: boolean;
};
export function DocumentRagComparePanel({ documentId, versionId, versionReady }: Props) {
  const [requestCompare, { isLoading: requesting }] = useRequestRagCompareMutation();
  const [jobId, setJobId] = useState<string | null>(null);
  const [pollJob, setPollJob] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const [reportDismissed, setReportDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: job } = useGetJobQuery(jobId!, {
    skip: !jobId,
    pollingInterval: pollJob ? 2000 : 0,
  });
  useEffect(() => {
    setJobId(null);
    setPollJob(false);
    setReport(null);
    setReportDismissed(false);
    setError(null);
  }, [versionId]);
  useEffect(() => {
    if (!job) return;
    if (job.status === 'completed') {
      setPollJob(false);
      if (job.payload?.report) {
        setReportDismissed(false);
        setReport(job.payload.report);
      }
    }
    if (job.status === 'failed') {
      setPollJob(false);
      setError(
        typeof job.payload === 'object' && job.payload && 'error' in job.payload
          ? String(
              (
                job.payload as {
                  error?: string;
                }
              ).error,
            )
          : 'Сверка не выполнена',
      );
    }
  }, [job]);
  async function handleCompare() {
    setError(null);
    setReportDismissed(false);
    setReport(null);
    try {
      const result = await requestCompare({ documentId, versionId }).unwrap();
      setJobId(result.jobId);
      setPollJob(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось запустить сверку');
    }
  }
  const loading = requesting || pollJob;
  const reportText = reportDismissed ? null : report;
  return (
    <div className="space-y-2.5 border-t border-slate-100 pt-3">
      <PanelSectionHeader title="Сверка с регламентом" />

      <div className={reportActionsColumnClass}>
        <FeatureHelpActionButton
          helpTitle="Сверить с регламентом"
          disabled={!versionReady || loading}
          onClick={() => void handleCompare()}
          buttonClassName={reportActionBtnSoft}
          helpContent={
            <>
              <p>
                Система сравнивает текст этой версии договора с фрагментами из раздела «Регламенты»
                в меню.
              </p>
              <p>Ниже появится отчёт: совпадения с вашими правилами, риски и рекомендации.</p>
              <p>
                Отчёт можно свернуть, открыть в отдельном окне («В окне») или удалить крестиком ×.
              </p>
              <p>Нужен хотя бы один регламент со статусом «готов к проверке».</p>
            </>
          }
        >
          {loading ? 'Сверка…' : 'Сверить с регламентом'}
        </FeatureHelpActionButton>
      </div>

      {loading && (
        <p className="rounded-lg border border-folio-100 bg-folio-50 px-3 py-2 text-xs text-slate-600">
          Идёт сравнение с вашими регламентами. Отчёт появится ниже через 1–2 минуты.
        </p>
      )}

      {error && (
        <div className="space-y-1">
          <p className="text-xs text-red-600">{error}</p>
          {(error.includes('Регламент') || error.includes('регламент')) && (
            <Link
              to="/app/regulations"
              className="text-xs font-medium text-folio-700 hover:underline"
            >
              Перейти в раздел «Регламенты» →
            </Link>
          )}
        </div>
      )}

      {reportText && (
        <ReportTextBlock
          title="Отчёт по сверке"
          windowTitle="Сверка с регламентом"
          collapsible
          onDismiss={() => {
            setReportDismissed(true);
            setJobId(null);
            setPollJob(false);
            setReport(null);
            setError(null);
          }}
          dismissLabel="Закрыть и очистить отчёт"
        >
          {reportText}
        </ReportTextBlock>
      )}

      {!loading && !reportText && !error && versionReady && (
        <p className="text-[11px] text-slate-400">
          Нажмите «Сверить с регламентом» — ниже появится текстовый отчёт.
        </p>
      )}
    </div>
  );
}
