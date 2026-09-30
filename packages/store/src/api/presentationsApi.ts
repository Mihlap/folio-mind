import { baseApi } from './baseApi.js';
import type {
  PresentationAiMode,
  PresentationSlideLayout,
} from '@folio-mind/pdf-contracts';

export type PresentationAiRequestMode = Exclude<PresentationAiMode, 'none'>;

export type PresentationSlideItem = {
  id: string;
  position: number;
  title: string | null;
  subtitle: string | null;
  body: string | null;
  notes: string | null;
  layoutVariant: PresentationSlideLayout;
  background: string | null;
  sourcePage: number | null;
  mediaAssetId: string | null;
};

export type PresentationItem = {
  id: string;
  documentId: string;
  versionId: string;
  title: string;
  aiMode: PresentationAiMode;
  slides: PresentationSlideItem[];
  createdAt: string;
  updatedAt: string;
};

export type PresentationSlideDraft = {
  id?: string;
  position: number;
  title?: string | null;
  subtitle?: string | null;
  body?: string | null;
  notes?: string | null;
  layoutVariant?: PresentationSlideLayout;
  background?: string | null;
  sourcePage?: number | null;
  mediaAssetId?: string | null;
};

export type PresentationDraft = {
  documentId: string;
  versionId: string;
  title: string;
  aiMode: PresentationAiMode;
  slides: PresentationSlideDraft[];
};

export type PresentationPreviewPage = {
  page: number;
  url: string;
};

export type PresentationPreviewsResult = {
  pageCount: number;
  pages: PresentationPreviewPage[];
  status: 'processing' | 'ready' | 'partial' | 'unavailable';
};

const tag = (documentId: string, versionId?: string) =>
  versionId
    ? [{ type: 'Presentations' as const, id: `${documentId}:${versionId}` }]
    : [{ type: 'Presentations' as const, id: 'LIST' }];

export const presentationsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getPresentation: build.query<
      { item: PresentationItem | null },
      { documentId: string; versionId?: string }
    >({
      query: ({ documentId, versionId }) => ({
        url: '/presentations',
        params: { documentId, ...(versionId ? { versionId } : {}) },
      }),
      providesTags: (_result, _error, arg) => tag(arg.documentId, arg.versionId),
    }),
    getPresentationPreviews: build.query<
      PresentationPreviewsResult,
      { documentId: string; versionId: string; from?: number; to?: number }
    >({
      query: ({ documentId, versionId, from, to }) => ({
        url: '/presentations/previews',
        params: { documentId, versionId, ...(from ? { from } : {}), ...(to ? { to } : {}) },
      }),
      providesTags: (_result, _error, arg) => [
        { type: 'Presentations' as const, id: `${arg.documentId}:${arg.versionId}` },
      ],
    }),
    savePresentation: build.mutation<PresentationItem, PresentationDraft>({
      query: (body) => ({ url: '/presentations', method: 'PUT', body }),
      invalidatesTags: (_result, _error, arg) => [
        ...tag(arg.documentId, arg.versionId),
        { type: 'Presentations', id: 'LIST' },
      ],
    }),
    exportPresentation: build.mutation<
      { documentId: string; versionId: string; operationJobId: string; status: 'processing' },
      { documentId: string; versionId: string }
    >({
      query: (body) => ({ url: '/presentations/export', method: 'POST', body }),
      invalidatesTags: ['Documents'],
    }),
    requestPresentationAi: build.mutation<
      { jobId: string; status: string },
      { documentId: string; versionId: string; mode: PresentationAiRequestMode }
    >({
      query: ({ documentId, versionId, mode }) => ({
        url: '/presentations/ai',
        method: 'POST',
        body: { documentId, versionId, mode },
      }),
    }),
    deletePresentation: build.mutation<{ ok: boolean }, { versionId: string }>({
      query: ({ versionId }) => ({
        url: '/presentations',
        method: 'DELETE',
        params: { versionId },
      }),
      invalidatesTags: [{ type: 'Presentations', id: 'LIST' }],
    }),
  }),
});

export const {
  useGetPresentationQuery,
  useGetPresentationPreviewsQuery,
  useSavePresentationMutation,
  useExportPresentationMutation,
  useRequestPresentationAiMutation,
  useDeletePresentationMutation,
} = presentationsApi;
