export { createAppStore, type AppStore, type RootState, type AppDispatch } from './store.js';
export { apiBaseUrl } from './api/baseApi.js';
export { uploadPdfVersion, type UploadPdfVersionArgs } from './lib/uploadPdfVersion.js';
export { uploadSourceDocx } from './lib/uploadSourceDocx.js';
export { putFileToPresignedUrl } from './lib/presignedUpload.js';
export {
  formatUploadError,
  isUploadNetworkError,
  UPLOAD_NETWORK_ERROR_MESSAGE,
} from './lib/formatUploadError.js';
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
  backgroundUploadSlice,
  uploadStarted,
  uploadProgress,
  uploadShowDone,
  uploadFinished,
  uploadFailed,
  clearUploadError,
  type BackgroundUploadKind,
} from './slices/backgroundUploadSlice.js';
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
  useSendPhoneCodeMutation,
  usePhoneRegisterMutation,
  usePhoneLoginMutation,
} from './api/authApi.js';
export {
  documentsApi,
  type DocumentListItem,
  type CreateDocumentBody,
  type CreateDocumentResponse,
  useListDocumentsQuery,
  useGetDocumentQuery,
  useCreateDocumentMutation,
  useCreateDocumentVersionMutation,
  useCompleteUploadMutation,
  useCompleteDocxUploadMutation,
  useUploadVersionFileMutation,
  useDeleteDocumentMutation,
  useDeleteDocumentVersionMutation,
  useLazyGetDownloadUrlQuery,
  useLazyGetSourceDocxUrlQuery,
  useGetVersionIntegrityQuery,
  useGetVersionPreviewsQuery,
  useSplitPagesMutation,
  useMergeVersionsMutation,
  useApplyEditsFinalMutation,
  useLazyCompareVersionsQuery,
  useCompareVersionIntegrityQuery,
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
