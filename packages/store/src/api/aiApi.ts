import { baseApi } from './baseApi.js';

export type AiProviderId = 'gigachat' | 'yandex';

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type SummaryJobResponse = {
  jobId: string;
  status: string;
  cached?: boolean;
};

export type AiJobPayload = {
  summary?: string;
  reply?: string;
  error?: string;
  model?: string;
  provider?: string;
  cached?: boolean;
  prompt?: string;
};

export const aiApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getAiProviders: build.query<
      {
        defaultProvider: AiProviderId;
        providers: Array<{
          id: AiProviderId;
          label: string;
          configured: boolean;
          active: boolean;
        }>;
        usageToday: number;
        dailyLimit: number;
      },
      void
    >({
      query: () => '/ai/providers',
    }),
    requestSummary: build.mutation<
      SummaryJobResponse,
      { documentId: string; versionId: string; provider?: AiProviderId }
    >({
      query: ({ documentId, versionId, provider }) => ({
        url: `/documents/${documentId}/versions/${versionId}/ai/summary`,
        method: 'POST',
        body: { provider },
      }),
    }),
    requestChat: build.mutation<
      SummaryJobResponse,
      {
        documentId: string;
        versionId: string;
        prompt: string;
        provider?: AiProviderId;
        history?: ChatMessage[];
      }
    >({
      query: ({ documentId, versionId, prompt, provider, history }) => ({
        url: `/documents/${documentId}/versions/${versionId}/ai/chat`,
        method: 'POST',
        body: { prompt, provider, history },
      }),
    }),
    exportReport: build.mutation<
      { url: string; key: string },
      {
        documentId: string;
        versionId: string;
        chatMessages?: ChatMessage[];
        format?: 'md' | 'pdf' | 'word';
      }
    >({
      query: ({ documentId, versionId, chatMessages, format = 'word' }) => ({
        url: `/documents/${documentId}/versions/${versionId}/ai/export`,
        method: 'POST',
        body: { chatMessages, format },
      }),
    }),
    getJob: build.query<
      {
        id: string;
        type: string;
        status: string;
        payload: AiJobPayload | null;
        createdAt: string;
        updatedAt: string;
      },
      string
    >({
      query: (jobId) => `/jobs/${jobId}`,
    }),
  }),
});

export const {
  useGetAiProvidersQuery,
  useRequestSummaryMutation,
  useRequestChatMutation,
  useExportReportMutation,
  useGetJobQuery,
  useLazyGetJobQuery,
} = aiApi;
