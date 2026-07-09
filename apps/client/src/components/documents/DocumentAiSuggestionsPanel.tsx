import { useEffect, useState } from 'react';
import {
  useGetJobQuery,
  useListAiSuggestionsQuery,
  useRequestAiSuggestionsMutation,
  useUpdateAiSuggestionMutation,
} from '@folio-mind/store';
import {
  FeatureHelpActionButton,
  FeatureHelpButton,
  PanelSectionHeader,
} from '../ui/FeatureHelp.js';
import { reportActionBtnPrimary, reportActionsColumnClass } from '../ui/FeatureHelp.styles.js';
import { AcceptedEditBeforeAfter } from './AcceptedEditBeforeAfter.js';
import { formatAiSuggestionsError } from '../../lib/ai/formatAiSuggestionsError.js';
type Props = {
  documentId: string;
  versionId: string;
  versionReady: boolean;
  viewerPage: number;
  pageCount?: number;
  onGoToPage: (page: number) => void;
};
function getMutationError(err: unknown): string {
  if (typeof err === 'object' && err && 'data' in err) {
    const data = (
      err as {
        data?: unknown;
      }
    ).data;
    if (typeof data === 'string') return formatAiSuggestionsError(data);
    if (typeof data === 'object' && data && 'error' in data) {
      return formatAiSuggestionsError(String((data as { error: string }).error));
    }
  }
  return formatAiSuggestionsError('Не удалось выполнить операцию');
}
function SuggestionMetaRow({
  page,
  reason,
  onGoToPage,
}: {
  page?: number | null;
  reason?: string;
  onGoToPage: (page: number) => void;
}) {
  const reasonText = reason?.trim();
  if (page == null && !reasonText) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {page != null && (
        <button
          type="button"
          onClick={() => onGoToPage(page)}
          className="cursor-pointer text-[11px] font-medium text-folio-700 hover:underline"
        >
          стр. {page}
        </button>
      )}
      {reasonText && (
        <FeatureHelpButton title="Почему предложена правка">
          <p className="whitespace-pre-wrap">{reasonText}</p>
        </FeatureHelpButton>
      )}
    </div>
  );
}

export function DocumentAiSuggestionsPanel({
  documentId,
  versionId,
  versionReady,
  viewerPage,
  pageCount = 0,
  onGoToPage,
}: Props) {
  const { data, refetch } = useListAiSuggestionsQuery({ documentId, versionId });
  const [requestSuggestions, { isLoading: requesting }] = useRequestAiSuggestionsMutation();
  const [updateSuggestion, { isLoading: updating }] = useUpdateAiSuggestionMutation();
  const [jobId, setJobId] = useState<string | null>(null);
  const [pollJob, setPollJob] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emptyAfterRun, setEmptyAfterRun] = useState(false);
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [suggestionScope, setSuggestionScope] = useState<'document' | 'page'>('document');
  const [targetPageInput, setTargetPageInput] = useState('1');
  const [runNotice, setRunNotice] = useState<string | null>(null);
  const { data: job } = useGetJobQuery(jobId!, {
    skip: !jobId,
    pollingInterval: pollJob ? 2000 : 0,
  });
  useEffect(() => {
    setJobId(null);
    setPollJob(false);
    setError(null);
    setEmptyAfterRun(false);
    setBulkUpdating(false);
    setSuggestionScope('document');
    setTargetPageInput('1');
    setRunNotice(null);
  }, [versionId]);

  function parseTargetPage(): number | null {
    const parsed = Number.parseInt(targetPageInput.trim(), 10);
    if (!Number.isFinite(parsed) || parsed < 1) return null;
    if (pageCount > 0 && parsed > pageCount) return null;
    return parsed;
  }

  function normalizeTargetPageInput() {
    const parsed = parseTargetPage();
    if (parsed == null) {
      setTargetPageInput('1');
      return 1;
    }
    setTargetPageInput(String(parsed));
    return parsed;
  }

  function setTargetPageFromViewer() {
    const page = viewerPage >= 1 ? viewerPage : 1;
    const clamped = pageCount > 0 ? Math.min(page, pageCount) : page;
    setTargetPageInput(String(clamped));
  }
  useEffect(() => {
    if (!job) return;
    if (job.status === 'completed' || job.status === 'failed') {
      setPollJob(false);
      if (job.status === 'completed') {
        const payload = job.payload as {
          suggestionCount?: number;
          resultHint?: string;
        } | null;
        const count = payload?.suggestionCount;
        setEmptyAfterRun(typeof count === 'number' && count === 0);
        setRunNotice(
          typeof payload?.resultHint === 'string' && payload.resultHint.trim()
            ? payload.resultHint
            : typeof count === 'number' && count > 0
              ? `Готово: ${count} предложений.`
              : 'ИИ не нашёл замечаний.',
        );
        void refetch();
      } else {
        setError(
          formatAiSuggestionsError(
            typeof job.payload === 'object' && job.payload && 'error' in job.payload
              ? String(
                  (
                    job.payload as {
                      error?: string;
                    }
                  ).error,
                )
              : null,
          ),
        );
      }
    }
  }, [job, refetch]);
  const pending = data?.items.filter((s) => s.status === 'pending') ?? [];
  const accepted = data?.items.filter((s) => s.status === 'accepted') ?? [];
  const rejected = data?.items.filter((s) => s.status === 'rejected') ?? [];
  const loading = requesting || pollJob;
  const decisionPending = updating || bulkUpdating;
  const hasSuggestions = pending.length > 0 || accepted.length > 0 || rejected.length > 0;
  async function handleRequest() {
    setError(null);
    setEmptyAfterRun(false);
    setRunNotice(null);
    if (suggestionScope === 'page') {
      if (!targetPageInput.trim()) {
        setError('Укажите номер страницы');
        return;
      }
      const page = normalizeTargetPageInput();
      if (pageCount > 0 && page > pageCount) {
        setError(`Страница ${page} больше числа страниц (${pageCount})`);
        return;
      }
    }
    try {
      const page = suggestionScope === 'page' ? normalizeTargetPageInput() : undefined;
      const result = await requestSuggestions({
        documentId,
        versionId,
        scope: suggestionScope,
        ...(suggestionScope === 'page' && page != null ? { page } : {}),
      }).unwrap();
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
  async function handleDecisionAll(status: 'accepted' | 'rejected') {
    if (pending.length === 0) return;
    setError(null);
    setBulkUpdating(true);
    try {
      await Promise.all(
        pending.map((item) =>
          updateSuggestion({ documentId, versionId, suggestionId: item.id, status }).unwrap(),
        ),
      );
      void refetch();
    } catch (err) {
      setError(getMutationError(err));
      void refetch();
    } finally {
      setBulkUpdating(false);
    }
  }
  return (
    <div className="space-y-2.5 border-t border-slate-100 pt-3">
      <PanelSectionHeader
        title="Предложения правок (ИИ)"
        helpTitle="Предложения правок"
        helpContent={
          <>
            <p>
              ИИ предлагает замены формулировок. «Принять» фиксирует решение и добавляет запись в список правок ниже.
            </p>
            <p>
              «Собрать PDF» — файл для пересылки: договор без изменений + реестр правок с полным
              текстом «было / стало» в приложении.
            </p>
          </>
        }
      />

      <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-2">
        <p className="text-[11px] font-medium text-slate-700">Область анализа</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] text-slate-600">
          <label className="inline-flex cursor-pointer items-center gap-1.5">
            <input
              type="radio"
              name={`ai-suggestions-scope-${versionId}`}
              checked={suggestionScope === 'document'}
              onChange={() => setSuggestionScope('document')}
              className="cursor-pointer"
            />
            Весь документ
          </label>
          <label className="inline-flex cursor-pointer items-center gap-1.5">
            <input
              type="radio"
              name={`ai-suggestions-scope-${versionId}`}
              checked={suggestionScope === 'page'}
              onChange={() => {
                setSuggestionScope('page');
                setTargetPageFromViewer();
              }}
              className="cursor-pointer"
            />
            Страница
          </label>
          {suggestionScope === 'page' && (
            <div className="inline-flex items-center gap-1.5">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={targetPageInput}
                onChange={(e) => setTargetPageInput(e.target.value.replace(/\D/g, ''))}
                onBlur={() => {
                  void normalizeTargetPageInput();
                }}
                className="w-12 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-center text-slate-800"
                aria-label="Номер страницы для анализа"
                title="Номер страницы для анализа"
              />
              {pageCount > 0 && <span className="text-slate-400">из {pageCount}</span>}
              <button
                type="button"
                onClick={setTargetPageFromViewer}
                className="cursor-pointer rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-600 hover:bg-slate-100"
                title="Подставить номер страницы из просмотрщика"
              >
                Текущая ({viewerPage})
              </button>
            </div>
          )}
        </div>
        <p className="mt-1.5 text-[10px] leading-snug text-slate-500">
          {suggestionScope === 'document'
            ? 'ИИ анализирует каждую страницу отдельно (надёжнее для длинных документов). Это может занять дольше.'
            : `ИИ анализирует только страницу ${targetPageInput || '…'} — удобно для точечной проверки.`}
        </p>
      </div>

      <div className={reportActionsColumnClass}>
        <FeatureHelpActionButton
          helpTitle="Запросить правки"
          disabled={!versionReady || loading}
          onClick={() => void handleRequest()}
          buttonClassName={reportActionBtnPrimary}
          helpContent={
            <>
              <p>
                Система извлекает текст из PDF и отправляет его в ИИ. Выберите «Весь документ» или
                одну страницу выше. Ниже появятся карточки с кнопками «Принять», «Отклонить» или
                «Принять всё» / «Отклонить всё».
              </p>
              <p>Нужна версия с текстовым слоем (не скан без OCR).</p>
            </>
          }
        >
          {loading ? 'Анализ…' : 'Запросить правки'}
        </FeatureHelpActionButton>
      </div>

      {loading && (
        <p className="rounded-lg border border-folio-100 bg-folio-50 px-3 py-2 text-xs text-slate-600">
          {suggestionScope === 'document' && pageCount > 1
            ? `Идёт анализ ${pageCount} стр. — обычно 1–3 мин.`
            : suggestionScope === 'page'
              ? `Идёт анализ страницы ${targetPageInput || '…'} — подождите 1–2 мин.`
              : 'Идёт анализ текста документа. Подождите 1–2 минуты.'}
        </p>
      )}

      {runNotice && !loading && (
        <p
          className={`rounded-lg border px-3 py-2 text-xs ${
            runNotice.includes('не нашёл')
              ? 'border-slate-200 bg-slate-50 text-slate-600'
              : 'border-folio-100 bg-folio-50 text-folio-800'
          }`}
        >
          {runNotice}
        </p>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      {!loading && !hasSuggestions && !emptyAfterRun && !runNotice && versionReady && (
        <p className="text-[11px] text-slate-400">
          Пока нет предложений. Нажмите «Запросить правки».
        </p>
      )}

      {pending.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-slate-600">
              Новые предложения ({pending.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                disabled={decisionPending}
                onClick={() => void handleDecisionAll('accepted')}
                className="cursor-pointer rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {bulkUpdating ? 'Обработка…' : 'Принять всё'}
              </button>
              <button
                type="button"
                disabled={decisionPending}
                onClick={() => void handleDecisionAll('rejected')}
                className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Отклонить всё
              </button>
            </div>
          </div>
          <ul className="space-y-3">
          {pending.map((item) => (
            <li key={item.id} className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
              <SuggestionMetaRow
                page={item.page}
                reason={item.reason}
                onGoToPage={onGoToPage}
              />
              <AcceptedEditBeforeAfter
                className="mt-2"
                compact
                before={item.originalText}
                after={item.suggestion}
                afterFormat="plain"
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={decisionPending}
                  onClick={() => void handleDecision(item.id, 'accepted')}
                  className="cursor-pointer rounded-lg bg-emerald-600 px-2.5 py-1 text-xs text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  Принять
                </button>
                <FeatureHelpButton title="Принять правку">
                  <p>
                    Фиксирует согласие с предложенной формулировкой и добавляет её в список правок
                    ниже. PDF этой версии не меняется — для файла с пометками нажмите «Собрать PDF
                    с правками».
                  </p>
                </FeatureHelpButton>
                <button
                  type="button"
                  disabled={decisionPending}
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
        </div>
      )}

      {accepted.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-600">Принято ({accepted.length})</p>
          <ul className="space-y-3">
            {accepted.map((item) => (
              <li
                key={item.id}
                className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-2"
              >
                <SuggestionMetaRow
                  page={item.page}
                  reason={item.reason}
                  onGoToPage={onGoToPage}
                />
                <AcceptedEditBeforeAfter
                  className="mt-2"
                  compact
                  before={item.originalText}
                  after={item.suggestion}
                  afterFormat="plain"
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      {rejected.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium text-slate-600">Отклонено ({rejected.length})</p>
          <ul className="space-y-1.5">
            {rejected.map((item) => (
              <li key={item.id} className="text-xs text-slate-500 line-through">
                {item.originalText.slice(0, 80)}
                {item.originalText.length > 80 ? '…' : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      {accepted.length > 0 && (
        <div className="text-[11px] text-slate-500">
          PDF собирается одной общей кнопкой в блоке «Правки в PDF» (она появляется после
          принятия правок).
        </div>
      )}
    </div>
  );
}
