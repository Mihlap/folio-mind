import type { RootState } from '../store.js';
import { apiBaseUrl, baseApi } from './baseApi.js';
import { UPLOAD_NETWORK_ERROR_MESSAGE } from '../lib/formatUploadError.js';
import type { DocumentReviewStatus } from '@folio-mind/pdf-contracts';
export type DocumentListItem = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  reviewStatus: DocumentReviewStatus;
  reviewStatusChangedAt: string | null;
  projectId: string | null;
  projectName: string | null;
  latestVersion: {
    id: string;
    version: number;
    status: string;
    size: string;
    mimeType: string;
    sourceDocxKey: string | null;
  } | null;
};
export type CreateDocumentBody = {
  title: string;
  fileName: string;
  mimeType: string;
  size: number;
  docxFileName?: string;
  projectId?: string;
};
export type CreateDocumentResponse = {
  document: DocumentListItem;
  versionId: string;
  uploadUrl: string;
  s3Key: string;
  docxUploadUrl?: string;
  docxS3Key?: string;
};
export const documentsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listDocuments: build.query<
      {
        items: DocumentListItem[];
        nextCursor: string | null;
      },
      {
        limit?: number;
        cursor?: string;
        projectId?: string;
      }
    >({
      query: ({ limit = 20, cursor, projectId }) => ({
        url: '/documents',
        params: {
          limit,
          ...(cursor ? { cursor } : {}),
          ...(projectId ? { projectId } : {}),
        },
      }),
      providesTags: [{ type: 'Documents', id: 'LIST' }],
    }),
    getDocument: build.query<
      {
        id: string;
        title: string;
        reviewStatus: DocumentReviewStatus;
        reviewStatusChangedAt: string | null;
        projectId: string | null;
        projectName: string | null;
        myRole: string | null;
        versions: Array<{
          id: string;
          version: number;
          versionLabel: 'draft' | 'in_review' | 'final' | null;
          status: string;
          size: string;
          mimeType: string;
          pageCount: number | null;
          createdAt: string;
          integrityStatus: string | null;
          integritySummary: string | null;
          confidenceLevel: 'green' | 'yellow' | 'red' | null;
          confidenceScore: number | null;
          confidenceSummary: string | null;
          confidenceDetails: Record<string, unknown> | null;
          sourceVersionId: string | null;
          sourceDocxKey: string | null;
          hasAppliedDocx: boolean;
        }>;
      },
      string
    >({
      query: (id) => `/documents/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'Documents', id }],
    }),
    createDocument: build.mutation<CreateDocumentResponse, CreateDocumentBody>({
      query: (body) => ({ url: '/documents', method: 'POST', body }),
      invalidatesTags: [
        { type: 'Documents', id: 'LIST' },
        { type: 'Projects', id: 'LIST' },
        { type: 'Projects' },
      ],
    }),
    createDocumentFromDocx: build.mutation<
      {
        document: DocumentListItem;
        versionId: string;
        docxUploadUrl: string;
        docxS3Key: string;
        pdfS3Key: string;
      },
      {
        title: string;
        fileName: string;
        size: number;
        projectId?: string;
      }
    >({
      query: (body) => ({ url: '/documents/from-docx', method: 'POST', body }),
      invalidatesTags: [
        { type: 'Documents', id: 'LIST' },
        { type: 'Projects', id: 'LIST' },
        { type: 'Projects' },
      ],
    }),
    importFromDocx: build.mutation<
      {
        operationJobId: string;
        versionId: string;
        status: 'processing';
      },
      {
        documentId: string;
        versionId: string;
      }
    >({
      query: ({ documentId, versionId }) => ({
        url: `/documents/${documentId}/versions/${versionId}/import-from-docx`,
        method: 'POST',
        body: {},
      }),
      invalidatesTags: (_r, _e, { documentId }) => [
        { type: 'Documents', id: 'LIST' },
        { type: 'Documents', id: documentId },
      ],
    }),
    createDocumentVersionFromDocx: build.mutation<
      {
        versionId: string;
        version: number;
        docxUploadUrl: string;
        docxS3Key: string;
        pdfS3Key: string;
      },
      {
        documentId: string;
        fileName: string;
        size: number;
      }
    >({
      query: ({ documentId, ...body }) => ({
        url: `/documents/${documentId}/versions/from-docx`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_r, _e, { documentId }) => [
        { type: 'Documents', id: 'LIST' },
        { type: 'Documents', id: documentId },
      ],
    }),
    completeDocxUpload: build.mutation<
      {
        sourceDocxKey: string;
      },
      {
        documentId: string;
        versionId: string;
        docxS3Key: string;
      }
    >({
      query: ({ documentId, versionId, docxS3Key }) => ({
        url: `/documents/${documentId}/versions/${versionId}/source-docx-complete`,
        method: 'POST',
        body: { docxS3Key },
      }),
      invalidatesTags: (_r, _e, { documentId }) => [
        { type: 'Documents', id: documentId },
      ],
    }),
    attachSourceDocx: build.mutation<
      { docxS3Key: string; uploadUrl: string },
      { documentId: string; versionId: string; fileName: string }
    >({
      query: ({ documentId, versionId, fileName }) => ({
        url: `/documents/${documentId}/versions/${versionId}/attach-source-docx`,
        method: 'POST',
        body: { fileName },
      }),
    }),
    createDocumentVersion: build.mutation<
      {
        versionId: string;
        version: number;
        s3Key: string;
        uploadUrl: string;
        docxUploadUrl?: string;
        docxS3Key?: string;
      },
      {
        documentId: string;
        fileName: string;
        mimeType: string;
        size: number;
        docxFileName?: string;
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
      {
        versionId: string;
        status: string;
        jobId: string;
      },
      {
        documentId: string;
        versionId: string;
        sha256?: string;
      }
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
    uploadVersionFile: build.mutation<
      {
        versionId: string;
        status: string;
        jobId: string;
      },
      {
        documentId: string;
        versionId: string;
        file: File;
      }
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
                ? String(
                    (
                      data as {
                        error: string;
                      }
                    ).error,
                  )
                : res.status === 503 || res.status >= 500
                  ? UPLOAD_NETWORK_ERROR_MESSAGE
                  : `Ошибка загрузки (${res.status})`;
            return { error: { status: res.status, data: err } };
          }
          return {
            data: data as {
              versionId: string;
              status: string;
              jobId: string;
            },
          };
        } catch {
          return {
            error: {
              status: 'FETCH_ERROR',
              error: UPLOAD_NETWORK_ERROR_MESSAGE,
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
      invalidatesTags: [
        { type: 'Documents', id: 'LIST' },
        { type: 'Projects', id: 'LIST' },
        { type: 'Projects' },
      ],
    }),
    deleteDocumentVersion: build.mutation<
      void,
      {
        documentId: string;
        versionId: string;
      }
    >({
      query: ({ documentId, versionId }) => ({
        url: `/documents/${documentId}/versions/${versionId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_r, _e, { documentId }) => [
        { type: 'Documents', id: 'LIST' },
        { type: 'Documents', id: documentId },
      ],
    }),
    getVersionPreviews: build.query<
      {
        pageCount: number;
        pages: Array<{
          page: number;
          url: string;
        }>;
        status: 'processing' | 'ready' | 'partial' | 'unavailable';
        pendingPages?: number[];
      },
      {
        documentId: string;
        versionId: string;
        from?: number;
        to?: number;
      }
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
      {
        url: string;
        expiresInSeconds: number;
      },
      {
        documentId: string;
        versionId: string;
      }
    >({
      query: ({ documentId, versionId }) =>
        `/documents/${documentId}/versions/${versionId}/download-url`,
    }),
    getSourceDocxUrl: build.query<
      {
        url: string;
        expiresInSeconds: number;
      },
      {
        documentId: string;
        versionId: string;
      }
    >({
      query: ({ documentId, versionId }) =>
        `/documents/${documentId}/versions/${versionId}/source-docx-url`,
    }),
    compareVersionIntegrity: build.query<
      {
        versionA: {
          versionId: string;
          status: 'pending' | 'intact' | 'modified' | 'cannot_verify' | 'failed' | null;
          score: number | null;
          summary: string | null;
          analyzedAt: string | null;
          details: {
            revisionCount: number;
            hasPrevTrailer: boolean;
            creator: string | null;
            producer: string | null;
            creationDate: string | null;
            modDate: string | null;
            hasDigitalSignature: boolean;
            signals: Array<{
              id: string;
              weight: string;
              message: string;
            }>;
            analyzedWith: 'qpdf' | 'builtin';
          } | null;
        };
        versionB: {
          versionId: string;
          status: 'pending' | 'intact' | 'modified' | 'cannot_verify' | 'failed' | null;
          score: number | null;
          summary: string | null;
          analyzedAt: string | null;
          details: {
            revisionCount: number;
            hasPrevTrailer: boolean;
            creator: string | null;
            producer: string | null;
            creationDate: string | null;
            modDate: string | null;
            hasDigitalSignature: boolean;
            signals: Array<{
              id: string;
              weight: string;
              message: string;
            }>;
            analyzedWith: 'qpdf' | 'builtin';
          } | null;
        };
        changed: boolean;
        statusDelta: string | null;
        scoreDelta: number | null;
      },
      {
        documentId: string;
        versionId: string;
        otherVersionId: string;
      }
    >({
      query: ({ documentId, versionId, otherVersionId }) =>
        `/documents/${documentId}/versions/${versionId}/integrity/compare/${otherVersionId}`,
    }),
    getVersionIntegrity: build.query<
      {
        versionId: string;
        status: 'pending' | 'intact' | 'modified' | 'cannot_verify' | 'failed' | null;
        score: number | null;
        summary: string | null;
        analyzedAt: string | null;
        details: {
          revisionCount: number;
          hasPrevTrailer: boolean;
          creator: string | null;
          producer: string | null;
          creationDate: string | null;
          modDate: string | null;
          hasDigitalSignature: boolean;
          signals: Array<{
            id: string;
            weight: string;
            message: string;
          }>;
          analyzedWith: 'qpdf' | 'builtin';
        } | null;
      },
      {
        documentId: string;
        versionId: string;
      }
    >({
      query: ({ documentId, versionId }) =>
        `/documents/${documentId}/versions/${versionId}/integrity`,
    }),
    splitPages: build.mutation<
      {
        operationJobId: string;
        versionId: string;
        version: number;
        status: 'processing';
        replacedInPlace: boolean;
      },
      {
        documentId: string;
        versionId: string;
        pages: number[];
      }
    >({
      query: ({ documentId, versionId, pages }) => ({
        url: `/documents/${documentId}/versions/${versionId}/operations/split`,
        method: 'POST',
        body: { pages },
      }),
      invalidatesTags: (_r, _e, { documentId }) => [
        { type: 'Documents', id: 'LIST' },
        { type: 'Documents', id: documentId },
      ],
    }),
    rearrangePages: build.mutation<
      {
        operationJobId: string;
        versionId: string;
        version: number;
        status: 'processing';
        replacedInPlace: boolean;
      },
      {
        documentId: string;
        versionId: string;
        pages: number[];
        saveMode?: 'new_version' | 'replace_current';
      }
    >({
      query: ({ documentId, versionId, pages, saveMode = 'new_version' }) => ({
        url: `/documents/${documentId}/versions/${versionId}/operations/rearrange-pages`,
        method: 'POST',
        body: { pages, saveMode },
      }),
      invalidatesTags: (_r, _e, { documentId }) => [
        { type: 'Documents', id: 'LIST' },
        { type: 'Documents', id: documentId },
      ],
    }),
    mergeVersions: build.mutation<
      {
        operationJobId: string;
        versionId: string;
        version: number;
        status: 'processing';
        replacedInPlace: boolean;
      },
      {
        documentId: string;
        versionIds: string[];
      }
    >({
      query: ({ documentId, versionIds }) => ({
        url: `/documents/${documentId}/operations/merge`,
        method: 'POST',
        body: { versionIds },
      }),
      invalidatesTags: (_r, _e, { documentId }) => [
        { type: 'Documents', id: 'LIST' },
        { type: 'Documents', id: documentId },
      ],
    }),
    optimizePdf: build.mutation<
      {
        operationJobId: string;
        versionId: string;
        version: number;
        status: 'processing';
      },
      {
        documentId: string;
        versionId: string;
        preset: 'email' | 'archive' | 'print' | 'none';
      }
    >({
      query: ({ documentId, versionId, preset }) => ({
        url: `/documents/${documentId}/versions/${versionId}/operations/optimize-pdf`,
        method: 'POST',
        body: { preset },
      }),
      invalidatesTags: (_r, _e, { documentId }) => [
        { type: 'Documents', id: 'LIST' },
        { type: 'Documents', id: documentId },
      ],
    }),
    applyLayoutPdf: build.mutation<
      {
        operationJobId: string;
        versionId: string;
        version: number;
        status: 'processing';
        replacedInPlace: boolean;
      },
      {
        documentId: string;
        versionId: string;
        objects: Array<{
          id: string;
          page: number;
          rect: { x: number; y: number; width: number; height: number };
          imageSrc: string;
          rotation: number;
          crop?: { x: number; y: number; width: number; height: number };
          sourceFileName?: string;
          caption?: string;
        }>;
        blankInsertions?: Array<{ afterPage: number; count: number }>;
        pageChrome?: {
          headerText?: string;
          footerText?: string;
          showPageNumbers?: boolean;
          startPageNumber?: number;
        };
        saveMode?: 'new_version' | 'replace_current';
      }
    >({
      query: ({ documentId, versionId, objects, blankInsertions = [], pageChrome, saveMode = 'new_version' }) => ({
        url: `/documents/${documentId}/versions/${versionId}/operations/apply-layout-pdf`,
        method: 'POST',
        body: { objects, blankInsertions, pageChrome, saveMode },
      }),
      invalidatesTags: (_r, _e, { documentId }) => [
        { type: 'Documents', id: 'LIST' },
        { type: 'Documents', id: documentId },
      ],
    }),
    applyEditsFinal: build.mutation<
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
        url: `/documents/${documentId}/versions/${versionId}/operations/apply-edits-final`,
        method: 'POST',
      }),
      invalidatesTags: (_r, _e, { documentId }) => [
        { type: 'Documents', id: 'LIST' },
        { type: 'Documents', id: documentId },
      ],
    }),
    exportHighlightDocx: build.mutation<
      { operationJobId: string; status: 'processing' },
      { documentId: string; versionId: string }
    >({
      query: ({ documentId, versionId }) => ({
        url: `/documents/${documentId}/versions/${versionId}/operations/export-highlight-docx`,
        method: 'POST',
      }),
    }),
    exportBooklet: build.mutation<
      { operationJobId: string; status: 'processing' },
      { documentId: string; versionId: string; jpegDpi?: number; pdfA?: boolean }
    >({
      query: ({ documentId, versionId, jpegDpi, pdfA }) => ({
        url: `/documents/${documentId}/versions/${versionId}/operations/export-booklet`,
        method: 'POST',
        body: { jpegDpi, pdfA },
      }),
    }),
    exportPages: build.mutation<
      { operationJobId: string; status: 'processing' },
      {
        documentId: string;
        versionId: string;
        pages: number[];
        format?: 'jpeg' | 'png';
        dpi?: number;
      }
    >({
      query: ({ documentId, versionId, pages, format, dpi }) => ({
        url: `/documents/${documentId}/versions/${versionId}/operations/export-pages`,
        method: 'POST',
        body: { pages, format, dpi },
      }),
    }),
    printReadiness: build.mutation<
      { operationJobId: string; status: 'processing' },
      { documentId: string; versionId: string }
    >({
      query: ({ documentId, versionId }) => ({
        url: `/documents/${documentId}/versions/${versionId}/operations/print-readiness`,
        method: 'POST',
      }),
    }),
    getBookletExportUrl: build.query<
      { url: string; expiresInSeconds: number },
      { documentId: string; versionId: string }
    >({
      query: ({ documentId, versionId }) =>
        `/documents/${documentId}/versions/${versionId}/booklet-export-url`,
    }),
    getPagesExportUrl: build.query<
      { url: string; expiresInSeconds: number },
      { documentId: string; versionId: string }
    >({
      query: ({ documentId, versionId }) =>
        `/documents/${documentId}/versions/${versionId}/pages-export-url`,
    }),
    getHighlightDocxUrl: build.query<
      { url: string; expiresInSeconds: number },
      { documentId: string; versionId: string }
    >({
      query: ({ documentId, versionId }) =>
        `/documents/${documentId}/versions/${versionId}/highlight-docx-url`,
    }),
    compareVersions: build.query<
      {
        baseVersionId: string;
        compareVersionId: string;
        baseVersion: number;
        compareVersion: number;
        summary: {
          unchangedPages: number;
          modifiedPages: number;
          addedPages: number;
          removedPages: number;
        };
        pages: Array<{
          page: number;
          status: 'unchanged' | 'modified' | 'added' | 'removed';
          baseText?: string;
          compareText?: string;
          lines?: Array<{
            type: 'equal' | 'insert' | 'delete';
            text: string;
          }>;
        }>;
        acceptedEdits: {
          baseCount: number;
          compareCount: number;
          onlyInCompare: Array<{
            page: number;
            quote: string;
            content: string;
          }>;
          onlyInBase: Array<{
            page: number;
            quote: string;
            content: string;
          }>;
          modified: Array<{
            page: number;
            baseQuote: string;
            compareQuote: string;
            baseContent: string;
            compareContent: string;
          }>;
        };
        pageCount: {
          base: number | null;
          compare: number | null;
        };
      },
      {
        documentId: string;
        baseVersionId: string;
        compareVersionId: string;
      }
    >({
      query: ({ documentId, baseVersionId, compareVersionId }) => ({
        url: `/documents/${documentId}/versions/compare`,
        params: { baseVersionId, compareVersionId },
      }),
    }),
    updateDocumentReviewStatus: build.mutation<
      {
        id: string;
        reviewStatus: DocumentReviewStatus;
        reviewStatusChangedAt: string | null;
      },
      { documentId: string; reviewStatus: DocumentReviewStatus }
    >({
      query: ({ documentId, reviewStatus }) => ({
        url: `/documents/${documentId}/review-status`,
        method: 'PATCH',
        body: { reviewStatus },
      }),
      invalidatesTags: (_result, _error, { documentId }) => [
        { type: 'Documents', id: documentId },
        { type: 'Documents', id: 'LIST' },
      ],
    }),
    updateVersionLabel: build.mutation<
      { versionId: string; versionLabel: 'draft' | 'in_review' | 'final' | null },
      {
        documentId: string;
        versionId: string;
        versionLabel: 'draft' | 'in_review' | 'final' | null;
      }
    >({
      query: ({ documentId, versionId, versionLabel }) => ({
        url: `/documents/${documentId}/versions/${versionId}/label`,
        method: 'PATCH',
        body: { versionLabel },
      }),
      invalidatesTags: (_result, _error, { documentId }) => [
        { type: 'Documents', id: documentId },
      ],
    }),
  }),
});
export const {
  useListDocumentsQuery,
  useGetDocumentQuery,
  useCreateDocumentMutation,
  useCreateDocumentFromDocxMutation,
  useImportFromDocxMutation,
  useCreateDocumentVersionMutation,
  useCreateDocumentVersionFromDocxMutation,
  useCompleteUploadMutation,
  useCompleteDocxUploadMutation,
  useAttachSourceDocxMutation,
  useUploadVersionFileMutation,
  useDeleteDocumentMutation,
  useDeleteDocumentVersionMutation,
  useLazyGetDownloadUrlQuery,
  useLazyGetSourceDocxUrlQuery,
  useGetVersionIntegrityQuery,
  useCompareVersionIntegrityQuery,
  useGetVersionPreviewsQuery,
  useSplitPagesMutation,
  useRearrangePagesMutation,
  useMergeVersionsMutation,
  useOptimizePdfMutation,
  useApplyLayoutPdfMutation,
  useApplyEditsFinalMutation,
  useExportHighlightDocxMutation,
  useExportBookletMutation,
  useExportPagesMutation,
  usePrintReadinessMutation,
  useLazyGetBookletExportUrlQuery,
  useLazyGetPagesExportUrlQuery,
  useLazyGetHighlightDocxUrlQuery,
  useLazyCompareVersionsQuery,
  useUpdateDocumentReviewStatusMutation,
  useUpdateVersionLabelMutation,
} = documentsApi;
