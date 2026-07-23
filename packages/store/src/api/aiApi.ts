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
  report?: string;
  error?: string;
  model?: string;
  provider?: string;
  cached?: boolean;
  prompt?: string;
  suggestionCount?: number;
  suggestionIds?: string[];
  analyzedPageCount?: number;
  scope?: 'document' | 'page';
  page?: number;
  resultHint?: string;
  ragChunkCount?: number;
  errorDetail?: string;
  rawText?: string;
  chatMode?: 'rag' | 'full';
  sources?: Array<{
    page: number | null;
    excerpt: string;
  }>;
  extracted?: Record<string, unknown>;
  templateId?: string | null;
  templateTitle?: string;
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
      {
        documentId: string;
        versionId: string;
        provider?: AiProviderId;
      }
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
      {
        url: string;
        key: string;
      },
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
    listAiSuggestions: build.query<
      {
        items: Array<{
          id: string;
          fragmentId: string;
          originalText: string;
          suggestion: string;
          reason: string;
          page: number | null;
          status: string;
          createdAt: string;
        }>;
      },
      {
        documentId: string;
        versionId: string;
      }
    >({
      query: ({ documentId, versionId }) =>
        `/documents/${documentId}/versions/${versionId}/ai/suggestions`,
      providesTags: (_r, _e, { versionId }) => [{ type: 'AiSuggestions', id: versionId }],
    }),
    requestAiSuggestions: build.mutation<
      SummaryJobResponse,
      {
        documentId: string;
        versionId: string;
        provider?: AiProviderId;
        scope?: 'document' | 'page';
        page?: number;
      }
    >({
      query: ({ documentId, versionId, provider, scope, page }) => ({
        url: `/documents/${documentId}/versions/${versionId}/ai/suggestions`,
        method: 'POST',
        body: {
          provider,
          scope,
          ...(scope === 'page' && page != null ? { page } : {}),
        },
      }),
      // Список обновляем после завершения job в панели, не сразу после POST.
    }),
    applyAcceptedSuggestions: build.mutation<
      {
        operationJobId: string;
        versionId: string;
        version: number;
        status: 'processing';
      },
      {
        documentId: string;
        versionId: string;
      }
    >({
      query: ({ documentId, versionId }) => ({
        url: `/documents/${documentId}/versions/${versionId}/ai/apply-accepted`,
        method: 'POST',
      }),
      invalidatesTags: (_r, _e, { documentId, versionId }) => [
        { type: 'AiSuggestions', id: versionId },
        { type: 'Documents', id: 'LIST' },
        { type: 'Documents', id: documentId },
        { type: 'Annotations', id: versionId },
      ],
    }),
    updateAiSuggestion: build.mutation<
      {
        id: string;
        status: string;
        fragmentId: string;
        originalText: string;
        suggestion: string;
        reason: string;
        page: number | null;
        createdAt: string;
      },
      {
        documentId: string;
        versionId: string;
        suggestionId: string;
        status: 'accepted' | 'rejected';
      }
    >({
      query: ({ documentId, versionId, suggestionId, status }) => ({
        url: `/documents/${documentId}/versions/${versionId}/ai/suggestions/${suggestionId}`,
        method: 'PATCH',
        body: { status },
      }),
      invalidatesTags: (_r, _e, { versionId }) => [
        { type: 'AiSuggestions', id: versionId },
        { type: 'Annotations', id: versionId },
      ],
    }),
    requestRagCompare: build.mutation<
      SummaryJobResponse,
      {
        documentId: string;
        versionId: string;
        query?: string;
        provider?: AiProviderId;
      }
    >({
      query: ({ documentId, versionId, query, provider }) => ({
        url: `/documents/${documentId}/versions/${versionId}/rag/compare`,
        method: 'POST',
        body: { query, provider },
      }),
    }),
    getExtractionTemplates: build.query<
      {
        templates: Array<{
          id: 'contract' | 'contract_sections' | 'act' | 'tz';
          title: string;
          description: string;
          schema: Array<{
            name: string;
            label: string;
            type: string;
            description: string;
            children?: Array<{
              name: string;
              label: string;
              type: string;
              description: string;
              children?: unknown[];
            }>;
          }>;
        }>;
      },
      void
    >({
      query: () => '/ai/extraction-templates',
    }),
    requestDocumentExtract: build.mutation<
      SummaryJobResponse,
      {
        documentId: string;
        versionId: string;
        templateId?: 'contract' | 'contract_sections' | 'act' | 'tz';
        provider?: AiProviderId;
      }
    >({
      query: ({ documentId, versionId, templateId, provider }) => ({
        url: `/documents/${documentId}/versions/${versionId}/ai/extract`,
        method: 'POST',
        body: { templateId, provider },
      }),
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
  useListAiSuggestionsQuery,
  useRequestAiSuggestionsMutation,
  useUpdateAiSuggestionMutation,
  useApplyAcceptedSuggestionsMutation,
  useRequestRagCompareMutation,
  useGetExtractionTemplatesQuery,
  useRequestDocumentExtractMutation,
} = aiApi;
