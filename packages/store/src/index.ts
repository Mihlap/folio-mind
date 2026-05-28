export { createAppStore, type AppStore, type RootState, type AppDispatch } from './store.js';

export { apiBaseUrl } from './api/baseApi.js';
export { uploadPdfVersion, type UploadPdfVersionArgs } from './lib/uploadPdfVersion.js';
export { putFileToPresignedUrl } from './lib/presignedUpload.js';

export { authSlice, setCredentials, logout } from './slices/authSlice.js';

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

  useGetVersionPreviewsQuery,

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

} from './api/aiApi.js';

