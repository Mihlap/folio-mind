import type { RootState } from '../store.js';
import { apiBaseUrl, baseApi } from './baseApi.js';

export type DocumentListItem = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  latestVersion: {
    id: string;
    version: number;
    status: string;
    size: string;
    mimeType: string;
  } | null;
};

export type CreateDocumentBody = {
  title: string;
  fileName: string;
  mimeType: string;
  size: number;
};

export type CreateDocumentResponse = {
  document: DocumentListItem;
  versionId: string;
  uploadUrl: string;
  s3Key: string;
};

export const documentsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listDocuments: build.query<
      { items: DocumentListItem[]; nextCursor: string | null },
      { limit?: number; cursor?: string }
    >({
      query: ({ limit = 20, cursor }) => ({
        url: '/documents',
        params: { limit, ...(cursor ? { cursor } : {}) },
      }),
      providesTags: [{ type: 'Documents', id: 'LIST' }],
    }),
    getDocument: build.query<
      {
        id: string;
        title: string;
        versions: Array<{
          id: string;
          version: number;
          status: string;
          size: string;
          mimeType: string;
          createdAt: string;
        }>;
      },
      string
    >({
      query: (id) => `/documents/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'Documents', id }],
    }),
    createDocument: build.mutation<CreateDocumentResponse, CreateDocumentBody>({
      query: (body) => ({ url: '/documents', method: 'POST', body }),
      invalidatesTags: [{ type: 'Documents', id: 'LIST' }],
    }),
    createDocumentVersion: build.mutation<
      { versionId: string; version: number; s3Key: string; uploadUrl: string },
      {
        documentId: string;
        fileName: string;
        mimeType: string;
        size: number;
      }
    >({
      query: ({ documentId, ...body }) => ({
        url: `/documents/${documentId}/versions`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_r, _e, { documentId }) => [
        { type: 'Documents', id: 'LIST' },
        { type: 'Documents', id: documentId },
      ],
    }),
    completeUpload: build.mutation<
      { versionId: string; status: string; jobId: string },
      { documentId: string; versionId: string; sha256?: string }
    >({
      query: ({ documentId, versionId, sha256 }) => ({
        url: `/documents/${documentId}/versions/${versionId}/complete`,
        method: 'POST',
        body: { sha256 },
      }),
      invalidatesTags: (_r, _e, { documentId }) => [
        { type: 'Documents', id: 'LIST' },
        { type: 'Documents', id: documentId },
      ],
    }),
    /** Загрузка PDF через API (обход CORS при прямом PUT в S3 из браузера). */
    uploadVersionFile: build.mutation<
      { versionId: string; status: string; jobId: string },
      { documentId: string; versionId: string; file: File }
    >({
      async queryFn({ documentId, versionId, file }, { getState }) {
        const token = (getState() as RootState).auth.token;
        const formData = new FormData();
        formData.append('file', file);
        try {
          const res = await fetch(
            `${apiBaseUrl}/documents/${documentId}/versions/${versionId}/upload`,
            {
              method: 'POST',
              headers: token ? { Authorization: `Bearer ${token}` } : {},
              body: formData,
            },
          );
          const data: unknown = await res.json().catch(() => ({}));
          if (!res.ok) {
            const err =
              typeof data === 'object' && data && 'error' in data
                ? String((data as { error: string }).error)
                : `Ошибка загрузки (${res.status})`;
            return { error: { status: res.status, data: err } };
          }
          return { data: data as { versionId: string; status: string; jobId: string } };
        } catch {
          return {
            error: {
              status: 'FETCH_ERROR',
              error:
                'Не удалось отправить файл на сервер. Проверьте, что API запущен (порт 3001).',
            },
          };
        }
      },
      invalidatesTags: (_r, _e, { documentId }) => [
        { type: 'Documents', id: 'LIST' },
        { type: 'Documents', id: documentId },
      ],
    }),
    deleteDocument: build.mutation<void, string>({
      query: (documentId) => ({
        url: `/documents/${documentId}`,
        method: 'DELETE',
      }),
      invalidatesTags: [{ type: 'Documents', id: 'LIST' }],
    }),
    getVersionPreviews: build.query<
      {
        pageCount: number;
        pages: Array<{ page: number; url: string }>;
        status: 'processing' | 'ready' | 'partial' | 'unavailable';
        pendingPages?: number[];
      },
      { documentId: string; versionId: string; from?: number; to?: number }
    >({
      query: ({ documentId, versionId, from, to }) => ({
        url: `/documents/${documentId}/versions/${versionId}/previews`,
        params: {
          ...(from !== undefined ? { from } : {}),
          ...(to !== undefined ? { to } : {}),
        },
      }),
    }),
    getDownloadUrl: build.query<
      { url: string; expiresInSeconds: number },
      { documentId: string; versionId: string }
    >({
      query: ({ documentId, versionId }) =>
        `/documents/${documentId}/versions/${versionId}/download-url`,
    }),
  }),
});

export const {
  useListDocumentsQuery,
  useGetDocumentQuery,
  useCreateDocumentMutation,
  useCreateDocumentVersionMutation,
  useCompleteUploadMutation,
  useUploadVersionFileMutation,
  useDeleteDocumentMutation,
  useLazyGetDownloadUrlQuery,
  useGetVersionPreviewsQuery,
} = documentsApi;
