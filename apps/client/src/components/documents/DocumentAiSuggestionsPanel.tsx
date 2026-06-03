import { useEffect, useState } from 'react';
import {
  useApplyAcceptedSuggestionsMutation,
  useGetJobQuery,
  useListAiSuggestionsQuery,
  useRequestAiSuggestionsMutation,
  useUpdateAiSuggestionMutation,
} from '@folio-mind/store';
import {
  FeatureHelpActionButton,
  FeatureHelpButton,
  PanelSectionHeader,
  reportActionBtnHighlight,
  reportActionBtnPrimary,
  reportActionsColumnClass,
} from '../ui/FeatureHelp.js';

type Props = {
  documentId: string;
  versionId: string;
  versionReady: boolean;
  onGoToPage: (page: number) => void;
  onSelectVersion: (versionId: string) => void;
};

function getMutationError(err: unknown): string {
  if (typeof err === 'object' && err && 'data' in err) {
    const data = (err as { data?: unknown }).data;
    if (typeof data === 'string') return data;
  }
  return 'Не удалось выполнить операцию';
}

export function DocumentAiSuggestionsPanel({
  documentId,
  versionId,
  versionReady,
  onGoToPage,
  onSelectVersion,
}: Props) {
  const { data, refetch } = useListAiSuggestionsQuery({ documentId, versionId });
  const [requestSuggestions, { isLoading: requesting }] = useRequestAiSuggestionsMutation();
  const [updateSuggestion, { isLoading: updating }] = useUpdateAiSuggestionMutation();
  const [applyAccepted, { isLoading: applying }] = useApplyAcceptedSuggestionsMutation();

  const [jobId, setJobId] = useState<string | null>(null);
  const [pollJob, setPollJob] = useState(false);
  const [operationJobId, setOperationJobId] = useState<string | null>(null);
  const [pollOperation, setPollOperation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applyHint, setApplyHint] = useState<string | null>(null);
  const [emptyAfterRun, setEmptyAfterRun] = useState(false);

  const { data: job } = useGetJobQuery(jobId!, { skip: !jobId, pollingInterval: pollJob ? 2000 : 0 });
  const { data: operationJob } = useGetJobQuery(operationJobId!, {
    skip: !operationJobId,
    pollingInterval: pollOperation ? 2000 : 0,
  });

  useEffect(() => {
    setJobId(null);
    setPollJob(false);
    setOperationJobId(null);
    setPollOperation(false);
    setError(null);
    setApplyHint(null);
    setEmptyAfterRun(false);
  }, [versionId]);

  useEffect(() => {
    if (!job) return;
    if (job.status === 'completed' || job.status === 'failed') {
      setPollJob(false);
      if (job.status === 'completed') {
        const count = job.payload?.suggestionCount;
        setEmptyAfterRun(typeof count === 'number' && count === 0);
        void refetch();
      } else {
        setError(
          typeof job.payload === 'object' && job.payload && 'error' in job.payload
            ? String((job.payload as { error?: string }).error)
            : 'ИИ не смог сформировать предложения',
        );
      }
    }
  }, [job, refetch]);

  useEffect(() => {
    if (!operationJob) return;
    if (operationJob.status === 'completed') {
      setPollOperation(false);
      setApplyHint('Новая версия с правками готова — откройте её в списке версий слева.');
    }
    if (operationJob.status === 'failed') {
      setPollOperation(false);
      setError(
        typeof operationJob.payload === 'object' &&
          operationJob.payload &&
          'error' in operationJob.payload
          ? String((operationJob.payload as { error?: string }).error)
          : 'Не удалось собрать PDF с правками',
      );
    }
  }, [operationJob]);

  const pending = data?.items.filter((s) => s.status === 'pending') ?? [];
  const accepted = data?.items.filter((s) => s.status === 'accepted') ?? [];
  const rejected = data?.items.filter((s) => s.status === 'rejected') ?? [];
  const loading = requesting || pollJob;
  const applyPending = applying || pollOperation;
  const hasSuggestions = pending.length > 0 || accepted.length > 0 || rejected.length > 0;

  async function handleRequest() {
    setError(null);
    setEmptyAfterRun(false);
    try {
      const result = await requestSuggestions({ documentId, versionId }).unwrap();
      setJobId(result.jobId);
      setPollJob(true);
    } catch (err) {
      setError(getMutationError(err));
    }
  }

  async function handleDecision(suggestionId: string, status: 'accepted' | 'rejected') {
    setError(null);
    try {
      await updateSuggestion({ documentId, versionId, suggestionId, status }).unwrap();
      void refetch();
    } catch (err) {
      setError(getMutationError(err));
    }
  }

  async function handleApplyPdf() {
    setError(null);
    setApplyHint(null);
    try {
      const result = await applyAccepted({ documentId, versionId }).unwrap();
      setOperationJobId(result.operationJobId);
      setPollOperation(true);
      onSelectVersion(result.versionId);
      setApplyHint(`Создана версия ${result.version}. Собираем PDF…`);
    } catch (err) {
      setError(getMutationError(err));
    }
  }

  return (
    <div className="space-y-2.5 border-t border-slate-100 pt-3">
      <PanelSectionHeader
        title="Предложения правок (ИИ)"
        helpTitle="Предложения правок"
        helpContent={
          <>
            <p>ИИ предлагает замены формулировок. «Принять» фиксирует решение и добавляет запись в аннотации.</p>
            <p>
              Чтобы получить PDF, нажмите «Собрать PDF с принятыми правками» — появится новая версия с
              пометками на страницах и приложением со списком правок.
            </p>
          </>
        }
      />

      <div className={reportActionsColumnClass}>
        <FeatureHelpActionButton
          helpTitle="Запросить правки"
          disabled={!versionReady || loading || applyPending}
          onClick={() => void handleRequest()}
          buttonClassName={reportActionBtnPrimary}
          helpContent={
            <>
              <p>
                Система извлекает текст из PDF и отправляет его в ИИ. Ниже появятся карточки с кнопками
                «Принять» и «Отклонить».
              </p>
              <p>Нужна версия с текстовым слоем (не скан без OCR).</p>
            </>
          }
        >
          {loading ? 'Анализ…' : 'Запросить правки'}
        </FeatureHelpActionButton>

        {accepted.length > 0 && (
          <FeatureHelpActionButton
            helpTitle="Собрать PDF с принятыми правками"
            disabled={!versionReady || loading || applyPending}
            onClick={() => void handleApplyPdf()}
            buttonClassName={reportActionBtnHighlight}
            helpContent={
              <>
                <p>
                  Создаёт новую версию документа. На затронутых страницах внизу появятся блоки «было /
                  стало», в конце — приложение со всеми принятыми правками.
                </p>
                <p>
                  Исходный текст в PDF не переписывается автоматически — это рабочая версия для
                  согласования. Для финального договора правки вносят в Word и загружают новый PDF.
                </p>
              </>
            }
          >
            {applyPending ? 'Сборка PDF…' : 'Собрать PDF с правками'}
          </FeatureHelpActionButton>
        )}
      </div>

      {loading && (
        <p className="rounded-lg border border-folio-100 bg-folio-50 px-3 py-2 text-xs text-slate-600">
          Идёт анализ текста документа. Подождите 1–2 минуты — предложения появятся списком ниже.
        </p>
      )}

      {applyHint && <p className="text-xs text-folio-700">{applyHint}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}

      {!loading && !hasSuggestions && !emptyAfterRun && versionReady && (
        <p className="text-[11px] text-slate-400">
          Пока нет предложений. Нажмите «Запросить правки».
        </p>
      )}

      {emptyAfterRun && !loading && !hasSuggestions && (
        <p className="text-xs text-slate-500">По этой версии ИИ не нашёл замечаний.</p>
      )}

      {pending.length > 0 && (
        <ul className="space-y-3">
          <p className="text-xs font-medium text-slate-600">
            Новые предложения ({pending.length})
          </p>
          {pending.map((item) => (
            <li key={item.id} className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
              {item.page != null && (
                <button
                  type="button"
                  onClick={() => onGoToPage(item.page!)}
                  className="cursor-pointer text-[11px] font-medium text-folio-700 hover:underline"
                >
                  стр. {item.page}
                </button>
              )}
              <p className="mt-1 text-xs text-slate-500 line-through">{item.originalText}</p>
              <p className="mt-1 text-xs text-slate-800">{item.suggestion}</p>
              <p className="mt-1 text-[11px] text-slate-500">{item.reason}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={updating || applyPending}
                  onClick={() => void handleDecision(item.id, 'accepted')}
                  className="cursor-pointer rounded-lg bg-emerald-600 px-2.5 py-1 text-xs text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  Принять
                </button>
                <FeatureHelpButton title="Принять правку">
                  <p>
                    Фиксирует согласие с предложенной формулировкой и сохраняет её в аннотациях (вкладка
                    «Инструменты»). PDF этой версии не меняется — для файла с пометками нажмите «Собрать
                    PDF с правками».
                  </p>
                </FeatureHelpButton>
                <button
                  type="button"
                  disabled={updating || applyPending}
                  onClick={() => void handleDecision(item.id, 'rejected')}
                  className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Отклонить
                </button>
                <FeatureHelpButton title="Отклонить правку">
                  <p>Отмечает предложение как отклонённое. В PDF и аннотациях оно не попадёт.</p>
                </FeatureHelpButton>
              </div>
            </li>
          ))}
        </ul>
      )}

      {(accepted.length > 0 || rejected.length > 0) && (
        <div>
          <p className="mb-2 text-xs font-medium text-slate-600">Уже обработано</p>
          <ul className="space-y-1.5">
            {[...accepted, ...rejected].map((item) => (
              <li key={item.id} className="text-xs text-slate-500">
                {item.status === 'accepted' ? '✓' : '✗'} {item.originalText.slice(0, 60)}
                {item.originalText.length > 60 ? '…' : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
