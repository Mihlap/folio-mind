import { baseApi } from './baseApi.js';

export type PageReviewMarkStatus = 'ok' | 'needs_fix';

export type PageReviewMark = {
  page: number;
  status: PageReviewMarkStatus;
  updatedAt: string;
};

export const pageReviewApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listPageReviewMarks: build.query<
      { items: PageReviewMark[] },
      { documentId: string; versionId: string }
    >({
      query: ({ documentId, versionId }) =>
        `/documents/${documentId}/versions/${versionId}/page-review-marks`,
      providesTags: (_r, _e, { versionId }) => [{ type: 'Documents', id: `page-marks-${versionId}` }],
    }),
    setPageReviewMark: build.mutation<
      { page: number; status: PageReviewMarkStatus | null },
      { documentId: string; versionId: string; page: number; status: PageReviewMarkStatus | null }
    >({
      query: ({ documentId, versionId, page, status }) => ({
        url: `/documents/${documentId}/versions/${versionId}/page-review-marks/${page}`,
        method: 'PUT',
        body: { status },
      }),
      invalidatesTags: (_r, _e, { versionId }) => [
        { type: 'Documents', id: `page-marks-${versionId}` },
      ],
    }),
  }),
});

export const { useListPageReviewMarksQuery, useSetPageReviewMarkMutation } = pageReviewApi;
