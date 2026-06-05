export { createAppStore, type AppStore, type RootState, type AppDispatch } from './store.js';

export { apiBaseUrl } from './api/baseApi.js';
export { uploadPdfVersion, type UploadPdfVersionArgs } from './lib/uploadPdfVersion.js';
export { putFileToPresignedUrl } from './lib/presignedUpload.js';

export { authSlice, setCredentials, setToken, logout } from './slices/authSlice.js';

export { uiSlice, toggleSidebar, setTheme } from './slices/uiSlice.js';

export {

  viewerSlice,

  setDisplayMode,

  setZoomMode,

  setCustomScale,

  zoomIn,

  zoomOut,

  resetZoom,

  setSearchQuery,

  setSearchMatches,

  nextSearchMatch,

  prevSearchMatch,

  clearSearch,

  type ViewerDisplayMode,

  type ViewerZoomMode,

  type SearchMatch,

} from './slices/viewerSlice.js';

export {

  authApi,

  useRegisterMutation,

  useVerifyEmailMutation,

  useResendVerificationMutation,
  useEmailVerificationStatusMutation,

  useRequestMagicLinkMutation,

  useVerifyMagicLinkMutation,

  useLoginMutation,

  useMeQuery,

  useHealthQuery,

  useForgotPasswordMutation,

  useResetPasswordMutation,

} from './api/authApi.js';

export {

  documentsApi,

  useListDocumentsQuery,

  useGetDocumentQuery,

  useCreateDocumentMutation,

  useCreateDocumentVersionMutation,

  useCompleteUploadMutation,

  useUploadVersionFileMutation,

  useDeleteDocumentMutation,
  useDeleteDocumentVersionMutation,

  useLazyGetDownloadUrlQuery,

  useGetVersionIntegrityQuery,

  useGetVersionPreviewsQuery,

  useSplitPagesMutation,

  useMergeVersionsMutation,

  useLazyCompareVersionsQuery,

} from './api/documentsApi.js';

export {

  aiApi,

  useGetAiProvidersQuery,

  useRequestSummaryMutation,

  useRequestChatMutation,

  useExportReportMutation,

  useGetJobQuery,

  useLazyGetJobQuery,

  type AiProviderId,

  type AiJobPayload,

  type ChatMessage,

  useListAiSuggestionsQuery,

  useRequestAiSuggestionsMutation,

  useUpdateAiSuggestionMutation,
  useApplyAcceptedSuggestionsMutation,

  useRequestRagCompareMutation,

} from './api/aiApi.js';

export {

  annotationsApi,

  type DocumentAnnotation,

  useListAnnotationsQuery,

  useCreateAnnotationMutation,

  useUpdateAnnotationMutation,
  useDeleteAnnotationMutation,

} from './api/annotationsApi.js';

export {

  ragApi,

  useListRagSourcesQuery,

  useCreateRagSourceMutation,

  useCompleteRagSourceMutation,

  useUploadRagSourceFileMutation,

  useDeleteRagSourceMutation,

  useQueryRagMutation,

} from './api/ragApi.js';

