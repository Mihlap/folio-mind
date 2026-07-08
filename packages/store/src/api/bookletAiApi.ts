import { baseApi } from './baseApi.js';

export type BookletTitleDraftResult = {
  title: string;
  subtitle: string;
  tagline: string;
  message?: string;
};

export type ProjectMaterialsSearchResult = {
  query: string;
  documents: Array<{ id: string; title: string }>;
  media: Array<{ id: string; title: string; fileName: string }>;
};

export const bookletAiApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    requestBookletTitleDraft: build.mutation<
      { jobId: string; status: 'processing' },
      { documentId: string; projectName?: string; objectHint?: string }
    >({
      query: ({ documentId, projectName, objectHint }) => ({
        url: `/documents/${documentId}/booklet-ai/title-draft`,
        method: 'POST',
        body: { projectName, objectHint },
      }),
    }),
    searchProjectMaterials: build.query<
      ProjectMaterialsSearchResult,
      { projectId: string; q: string }
    >({
      query: ({ projectId, q }) =>
        `/projects/${projectId}/materials-search?q=${encodeURIComponent(q)}`,
    }),
  }),
});

export const {
  useRequestBookletTitleDraftMutation,
  useLazySearchProjectMaterialsQuery,
} = bookletAiApi;
