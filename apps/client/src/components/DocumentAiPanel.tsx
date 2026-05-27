import { useEffect, useState } from 'react';
import {
  useExportReportMutation,
  useGetAiProvidersQuery,
  useGetJobQuery,
  useRequestChatMutation,
  useRequestSummaryMutation,
  type AiProviderId,
  type ChatMessage,
} from '@folio-mind/store';

type DocumentAiPanelProps = {
  documentId: string;
  documentTitle: string;
  versionId: string;
  versionNumber: number;
  versionReady: boolean;
};

function isJobPending(status: string | undefined) {
  return status === 'queued' || status === 'processing';
}

export function DocumentAiPanel({
  documentId,
  documentTitle,
  versionId,
  versionNumber,
  versionReady,
}: DocumentAiPanelProps) {
  const { data: providersData } = useGetAiProvidersQuery();
  const [provider, setProvider] = useState<AiProviderId | undefined>();
  const [requestSummary, { isLoading: summaryLoading }] = useRequestSummaryMutation();
  const [requestChat, { isLoading: chatSending }] = useRequestChatMutation();
  const [exportReport, { isLoading: exporting }] = useExportReportMutation();

  const [summaryJobId, setSummaryJobId] = useState<string | null>(null);
  const [chatJobId, setChatJobId] = useState<string | null>(null);
  const [pollSummary, setPollSummary] = useState(false);
  const [pollChat, setPollChat] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [exportError, setExportError] = useState<string | null>(null);

  const activeProvider = provider ?? providersData?.defaultProvider ?? 'gigachat';

  const { data: summaryJob } = useGetJobQuery(summaryJobId!, {
    skip: !summaryJobId,
    pollingInterval: pollSummary ? 2000 : 0,
  });
  const { data: chatJob } = useGetJobQuery(chatJobId!, {
    skip: !chatJobId,
    pollingInterval: pollChat ? 2000 : 0,
  });

  const summaryText = summaryJob?.payload?.summary;
  const summaryError = summaryJob?.payload?.error;
  const summaryPending = isJobPending(summaryJob?.status);
  const chatPending = isJobPending(chatJob?.status);
  const chatError = chatJob?.payload?.error;

  useEffect(() => {
    setSummaryJobId(null);
    setChatJobId(null);
    setPollSummary(false);
    setPollChat(false);
    setMessages([]);
    setChatInput('');
    setExportError(null);
  }, [versionId]);

  useEffect(() => {
    if (summaryJob?.status === 'completed' || summaryJob?.status === 'failed') {
      setPollSummary(false);
    }
  }, [summaryJob?.status]);

  useEffect(() => {
    if (chatJob?.status === 'completed' && chatJob.payload?.reply) {
      setPollChat(false);
      setMessages((prev) => [...prev, { role: 'assistant', content: chatJob.payload!.reply! }]);
    }
    if (chatJob?.status === 'failed') {
      setPollChat(false);
    }
  }, [chatJob?.status, chatJob?.payload?.reply]);

  const configuredProviders =
    providersData?.providers.filter((p) => p.configured) ?? [];

  return (
    <section className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {configuredProviders.length > 1 && (
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <span>ИИ:</span>
            <select
              value={activeProvider}
              onChange={(e) => setProvider(e.target.value as AiProviderId)}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
            >
              {configuredProviders.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {providersData && (
          <span className="text-xs text-slate-400">
            Запросов сегодня: {providersData.usageToday}/{providersData.dailyLimit}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={!versionReady || summaryLoading || summaryPending}
          onClick={async () => {
            const result = await requestSummary({
              documentId,
              versionId,
              provider: activeProvider,
            }).unwrap();
            setSummaryJobId(result.jobId);
            setPollSummary(true);
          }}
          className="cursor-pointer rounded-lg bg-folio-600 px-4 py-2 text-sm font-medium text-white hover:bg-folio-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {summaryLoading || summaryPending ? 'Готовим пересказ…' : 'Получить пересказ'}
        </button>
        <button
          type="button"
          disabled={!versionReady || !summaryText || exporting}
          onClick={async () => {
            setExportError(null);
            try {
              const result = await exportReport({
                documentId,
                versionId,
                chatMessages: messages,
              }).unwrap();
              window.open(result.url, '_blank', 'noopener,noreferrer');
            } catch (e) {
              setExportError(e instanceof Error ? e.message : 'Не удалось экспортировать отчёт');
            }
          }}
          className="cursor-pointer rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-folio-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {exporting ? 'Экспорт…' : 'Экспорт отчёта (MD)'}
        </button>
      </div>

      <p className="text-xs text-slate-400">
        Пересказ и чат работают по выбранной версии «{documentTitle}» v{versionNumber}.
      </p>

      {(summaryPending || summaryText || summaryError) && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Пересказ · v{versionNumber}</h2>
          {summaryPending && (
            <p className="mt-2 text-sm text-slate-500">ИИ готовит пересказ… Обычно до минуты.</p>
          )}
          {summaryError && <p className="mt-2 text-sm text-red-600">{summaryError}</p>}
          {summaryText && (
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
              {summaryText}
            </p>
          )}
          {summaryJob?.payload?.cached && summaryText && (
            <p className="mt-3 text-xs text-slate-400">Из кэша для этой версии</p>
          )}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Чат по документу</h2>
          <p className="mt-1 text-xs text-slate-500">
            Вопросы по содержимому PDF. Ответ через очередь — не блокирует интерфейс.
          </p>
        </div>

        <div className="max-h-64 space-y-3 overflow-y-auto px-5 py-4">
          {messages.length === 0 && (
            <p className="text-sm text-slate-400">Задайте вопрос о документе…</p>
          )}
          {messages.map((msg, idx) => (
            <div
              key={`${idx}-${msg.role}`}
              className={`rounded-xl px-3 py-2 text-sm ${
                msg.role === 'user'
                  ? 'ml-8 bg-folio-50 text-slate-800'
                  : 'mr-8 bg-slate-50 text-slate-700'
              }`}
            >
              <p className="mb-1 text-xs font-medium text-slate-500">
                {msg.role === 'user' ? 'Вы' : 'ИИ'}
              </p>
              <p className="whitespace-pre-wrap">{msg.content}</p>
            </div>
          ))}
          {chatPending && <p className="text-sm text-slate-500">ИИ думает…</p>}
          {chatError && <p className="text-sm text-red-600">{chatError}</p>}
        </div>

        <form
          className="flex gap-2 border-t border-slate-100 p-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const prompt = chatInput.trim();
            if (!prompt || !versionReady || chatSending || chatPending) return;

            const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: prompt }];
            setMessages(nextMessages);
            setChatInput('');

            const result = await requestChat({
              documentId,
              versionId,
              prompt,
              provider: activeProvider,
              history: messages,
            }).unwrap();
            setChatJobId(result.jobId);
            setPollChat(true);
          }}
        >
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Например: какая сумма в договоре?"
            disabled={!versionReady || chatSending || chatPending}
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-folio-400 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!versionReady || !chatInput.trim() || chatSending || chatPending}
            className="cursor-pointer rounded-lg bg-folio-600 px-4 py-2 text-sm font-medium text-white hover:bg-folio-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Отправить
          </button>
        </form>
      </div>

      {exportError && <p className="text-sm text-red-600">{exportError}</p>}
    </section>
  );
}
