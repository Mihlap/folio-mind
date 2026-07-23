import { useEffect, useState } from 'react';
import {
  useGetAiProvidersQuery,
  useGetJobQuery,
  useRequestChatMutation,
  type AiProviderId,
  type ChatMessage,
} from '@folio-mind/store';

type DocumentAiPanelProps = {
  documentId: string;
  versionId: string;
  versionReady: boolean;
  embedded?: boolean;
};

type ChatUiMessage = ChatMessage & {
  sources?: Array<{ page: number | null; excerpt: string }>;
  chatMode?: 'rag' | 'full';
};

function isJobPending(status: string | undefined) {
  return status === 'queued' || status === 'processing';
}

export function DocumentAiPanel({
  documentId,
  versionId,
  versionReady,
  embedded = false,
}: DocumentAiPanelProps) {
  const { data: providersData } = useGetAiProvidersQuery();
  const [provider, setProvider] = useState<AiProviderId | undefined>();
  const [requestChat, { isLoading: chatSending }] = useRequestChatMutation();
  const [chatJobId, setChatJobId] = useState<string | null>(null);
  const [pollChat, setPollChat] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<ChatUiMessage[]>([]);
  const activeProvider = provider ?? providersData?.defaultProvider ?? 'gigachat';
  const { data: chatJob } = useGetJobQuery(chatJobId!, {
    skip: !chatJobId,
    pollingInterval: pollChat ? 2000 : 0,
  });
  const chatPending = isJobPending(chatJob?.status);
  const chatError = chatJob?.payload?.error;
  const chatReply = chatJob?.payload?.reply;
  const chatSources = chatJob?.payload?.sources;
  const chatMode = chatJob?.payload?.chatMode;

  useEffect(() => {
    setChatJobId(null);
    setPollChat(false);
    setMessages([]);
    setChatInput('');
  }, [versionId]);

  useEffect(() => {
    if (chatJob?.status === 'completed' && chatReply) {
      setPollChat(false);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: chatReply,
          sources: chatSources,
          chatMode,
        },
      ]);
    }
    if (chatJob?.status === 'failed') {
      setPollChat(false);
    }
  }, [chatJob?.status, chatReply, chatSources, chatMode]);

  const configuredProviders = providersData?.providers.filter((p) => p.configured) ?? [];
  const messagesMaxHeight = embedded
    ? 'max-h-[min(42vh,360px)]'
    : 'max-h-[38vh] sm:max-h-[40vh] lg:max-h-[48vh]';

  return (
    <section className={embedded ? 'flex flex-col' : 'space-y-3 sm:space-y-4'}>
      <div
        className={`flex flex-wrap items-center gap-3 ${embedded ? 'border-b border-slate-100 px-4 py-2' : ''}`}
      >
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

      <div
        className={
          embedded
            ? 'flex min-h-0 flex-1 flex-col'
            : 'rounded-2xl border border-slate-200 bg-white shadow-sm'
        }
      >
        {!embedded && (
          <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
            <h2 className="text-sm font-semibold text-slate-900">Чат по документу</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Можно спрашивать о тексте PDF и о работе в РазУм — шаблоны, медиатека, макет, гостевая
              ссылка.
            </p>
          </div>
        )}

        {(messages.length > 0 || chatPending || chatError) && (
          <div
            className={`space-y-3 overflow-y-auto px-4 py-3 sm:px-5 sm:py-4 ${messagesMaxHeight}`}
          >
            {messages.map((msg, idx) => (
              <div
                key={`${idx}-${msg.role}`}
                className={`rounded-xl px-3 py-2 text-sm ${
                  msg.role === 'user'
                    ? 'ml-4 sm:ml-8 bg-folio-50 text-slate-800'
                    : 'mr-4 sm:mr-8 bg-slate-50 text-slate-700'
                }`}
              >
                <p className="mb-1 text-xs font-medium text-slate-500">
                  {msg.role === 'user' ? 'Вы' : 'ИИ'}
                  {msg.role === 'assistant' && msg.chatMode === 'rag' && (
                    <span className="ml-1.5 font-normal text-slate-400">· по фрагментам</span>
                  )}
                </p>
                <p className="whitespace-pre-wrap">{msg.content}</p>
                {msg.role === 'assistant' && msg.sources && msg.sources.length > 0 && (
                  <details className="mt-2 rounded-lg border border-slate-200/80 bg-white/70 px-2.5 py-1.5">
                    <summary className="cursor-pointer text-[11px] font-medium text-slate-500">
                      Источники ({msg.sources.length})
                    </summary>
                    <ul className="mt-1.5 space-y-1.5">
                      {msg.sources.map((source, sourceIdx) => (
                        <li key={`${idx}-src-${sourceIdx}`} className="text-[11px] text-slate-600">
                          <span className="font-medium text-slate-500">
                            {source.page != null ? `Стр. ${source.page}` : `Фрагмент ${sourceIdx + 1}`}
                            :
                          </span>{' '}
                          <span className="whitespace-pre-wrap">
                            {source.excerpt}
                            {source.excerpt.length >= 220 ? '…' : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            ))}
            {chatPending && <p className="text-sm text-slate-500">ИИ думает…</p>}
            {chatError && <p className="text-sm text-red-600">{chatError}</p>}
          </div>
        )}

        <form
          className="flex flex-col gap-2 border-t border-slate-100 p-3 sm:p-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const prompt = chatInput.trim();
            if (!prompt || !versionReady || chatSending || chatPending) return;
            const historyForApi: ChatMessage[] = messages.map(({ role, content }) => ({
              role,
              content,
            }));
            const nextMessages: ChatUiMessage[] = [
              ...messages,
              { role: 'user', content: prompt },
            ];
            setMessages(nextMessages);
            setChatInput('');
            const result = await requestChat({
              documentId,
              versionId,
              prompt,
              provider: activeProvider,
              history: historyForApi,
            }).unwrap();
            setChatJobId(result.jobId);
            setPollChat(true);
          }}
        >
          <textarea
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Спросите о тексте PDF или как пользоваться приложением (шаблоны, медиатека, макет…)"
            disabled={!versionReady || chatSending || chatPending}
            rows={3}
            className="min-h-[96px] w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-folio-400 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!versionReady || !chatInput.trim() || chatSending || chatPending}
            className="w-full cursor-pointer rounded-lg bg-folio-600 px-4 py-2 text-sm font-medium text-white hover:bg-folio-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Отправить
          </button>
        </form>
      </div>
    </section>
  );
}
