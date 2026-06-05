import { baseApi } from './baseApi.js';

export type DocumentAnnotation = {
  id: string;
  documentId: string;
  versionId: string;
  userId: string;
  page: number;
  kind: string;
  content: string;
  quote: string | null;
  createdAt: string;
  updatedAt: string;
};

export const annotationsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listAnnotations: build.query<
      { items: DocumentAnnotation[] },
      { documentId: string; versionId: string }
    >({
      query: ({ documentId, versionId }) =>
        `/documents/${documentId}/versions/${versionId}/annotations`,
      providesTags: (_r, _e, { versionId }) => [{ type: 'Annotations', id: versionId }],
    }),
    createAnnotation: build.mutation<
      DocumentAnnotation,
      {
        documentId: string;
        versionId: string;
        page: number;
        content: string;
        kind?: 'comment' | 'highlight' | 'accepted_edit';
        quote?: string;
      }
    >({
      query: ({ documentId, versionId, ...body }) => ({
        url: `/documents/${documentId}/versions/${versionId}/annotations`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_r, _e, { versionId }) => [{ type: 'Annotations', id: versionId }],
    }),
    updateAnnotation: build.mutation<
      DocumentAnnotation,
      {
        documentId: string;
        versionId: string;
        annotationId: string;
        page?: number;
        content?: string;
        quote?: string;
      }
    >({
      query: ({ documentId, versionId, annotationId, ...body }) => ({
        url: `/documents/${documentId}/versions/${versionId}/annotations/${annotationId}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: (_r, _e, { versionId }) => [{ type: 'Annotations', id: versionId }],
    }),
    deleteAnnotation: build.mutation<
      void,
      { documentId: string; versionId: string; annotationId: string }
    >({
      query: ({ documentId, versionId, annotationId }) => ({
        url: `/documents/${documentId}/versions/${versionId}/annotations/${annotationId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_r, _e, { versionId }) => [{ type: 'Annotations', id: versionId }],
    }),
  }),
});

export const {
  useListAnnotationsQuery,
  useCreateAnnotationMutation,
  useUpdateAnnotationMutation,
  useDeleteAnnotationMutation,
} = annotationsApi;
