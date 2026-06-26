import { baseApi } from './baseApi.js';
export type RagSourceItem = {
  id: string;
  title: string;
  fileName: string;
  status: string;
  chunkCount: number;
  createdAt: string;
};
export const ragApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listRagSources: build.query<
      {
        items: RagSourceItem[];
      },
      void
    >({
      query: () => '/rag/sources',
      providesTags: [{ type: 'RagSources', id: 'LIST' }],
    }),
    createRagSource: build.mutation<
      {
        sourceId: string;
        uploadUrl?: string;
        status: string;
      },
      {
        title: string;
        fileName: string;
        mimeType: string;
        size: number;
      }
    >({
      query: (body) => ({ url: '/rag/sources', method: 'POST', body }),
      invalidatesTags: [{ type: 'RagSources', id: 'LIST' }],
    }),
    completeRagSource: build.mutation<
      {
        sourceId: string;
        status: string;
        jobId: string;
      },
      {
        sourceId: string;
      }
    >({
      query: ({ sourceId }) => ({
        url: `/rag/sources/${sourceId}/complete`,
        method: 'POST',
      }),
      invalidatesTags: [{ type: 'RagSources', id: 'LIST' }],
    }),
    uploadRagSourceFile: build.mutation<
      {
        sourceId: string;
        status: string;
        jobId: string;
      },
      {
        sourceId: string;
        file: File;
      }
    >({
      async queryFn({ sourceId, file }, { getState }) {
        const { apiBaseUrl } = await import('./baseApi.js');
        const token = (
          getState() as {
            auth: {
              token: string | null;
            };
          }
        ).auth.token;
        const formData = new FormData();
        formData.append('file', file);
        try {
          const res = await fetch(`${apiBaseUrl}/rag/sources/${sourceId}/upload`, {
            method: 'POST',
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            body: formData,
          });
          const data: unknown = await res.json().catch(() => ({}));
          if (!res.ok) {
            const err =
              typeof data === 'object' && data && 'error' in data
                ? String(
                    (
                      data as {
                        error: string;
                      }
                    ).error,
                  )
                : `Ошибка (${res.status})`;
            return { error: { status: res.status, data: err } };
          }
          return {
            data: data as {
              sourceId: string;
              status: string;
              jobId: string;
            },
          };
        } catch {
          return { error: { status: 'FETCH_ERROR', error: 'Не удалось загрузить файл' } };
        }
      },
      invalidatesTags: [{ type: 'RagSources', id: 'LIST' }],
    }),
    deleteRagSource: build.mutation<void, string>({
      query: (sourceId) => ({ url: `/rag/sources/${sourceId}`, method: 'DELETE' }),
      invalidatesTags: [{ type: 'RagSources', id: 'LIST' }],
    }),
    queryRag: build.mutation<
      {
        chunks: Array<{
          id: string;
          sourceId: string;
          sourceTitle: string;
          chunkIndex: number;
          content: string;
        }>;
      },
      {
        query: string;
        limit?: number;
      }
    >({
      query: (body) => ({ url: '/rag/query', method: 'POST', body }),
    }),
  }),
});
export const {
  useListRagSourcesQuery,
  useCreateRagSourceMutation,
  useCompleteRagSourceMutation,
  useUploadRagSourceFileMutation,
  useDeleteRagSourceMutation,
  useQueryRagMutation,
} = ragApi;
