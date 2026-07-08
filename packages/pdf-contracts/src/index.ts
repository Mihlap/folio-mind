export {
  FILES_ROOT,
  S3_PREFIX,
  assertS3KeyUnderFilesRoot,
  extractedTextKey,
  exportReportPdfKey,
  exportReportKey,
  exportReportWordKey,
  highlightEditsDocxKey,
  exportBookletZipKey,
  exportPagesZipKey,
  preConvertedDocxKey,
  appliedDocxKey,
  previewPageKey,
  previewPageThumbKey,
  previewPageViewKey,
  mediaAssetKey,
  mediaAssetThumbKey,
  mediaAssetFolderPrefix,
  previewPageKeyForVariant,
  type PreviewPageVariant,
  resolveS3Key,
  type S3PrefixKey,
} from './s3-paths.js';
export {
  SHARE_LINK_TTL_PRESETS,
  SHARE_LINK_TTL_PRESET_IDS,
  DEFAULT_SHARE_LINK_TTL_PRESET,
  shareLinkTtlMs,
  shareLinkTtlLabel,
  isShareLinkTtlPresetId,
  type ShareLinkTtlPresetId,
} from './share-link-ttl.js';
export { isDocxBuffer, isUserUploadedSourceDocxKey } from './docx.js';
export {
  getRootVersionFromChain,
  getVersionChain,
  type VersionAncestry,
} from './version-lineage.js';
export {
  normalizePageTexts,
  parseExtractedTextJson,
  type ExtractedDocumentText,
  type PageText,
} from './extracted-text.js';
export {
  arePageTextsEquivalent,
  compareVersionTexts,
  diffPageLines,
  normalizePageTextForCompare,
  type CompareVersionTextsOptions,
  type PageDiffStatus,
  type PageTextDiff,
  type TextDiffLine,
  type VersionTextCompareResult,
  type VersionTextCompareSummary,
} from './text-diff.js';
export {
  analyzePdfIntegrity,
  parsePdfDate,
  type PdfIntegrityDetails,
  type PdfIntegrityResult,
  type PdfIntegritySignal,
  type PdfIntegrityVerdict,
} from './pdf-integrity.js';
export {
  buildPageLayoutSignature,
  comparePageLayoutSignatures,
  type LayoutPoint,
  type PageLayoutSignature,
} from './layout-confidence.js';
export {
  comparePagePixelDiffs,
  computePixelDiffRatio,
  summarizePixelDrift,
  type PagePixelDiffResult,
  type RgbaPageBitmap,
} from './pixel-diff.js';
export {
  scoreApplyEditsConfidence,
  scoreDocxReflowConfidence,
  type ApplyEditsMethod,
  type ConfidenceDetails,
  type ConfidenceLevel,
  type ConfidenceResult,
} from './confidence-scoring.js';
export {
  isOptimizePreset,
  OPTIMIZE_PRESET_INFO,
  OPTIMIZE_PRESETS,
  type OptimizePreset,
  type OptimizePresetInfo,
} from './optimize-preset.js';
export {
  estimateOptimizeSize,
  formatFileSize,
  formatOptimizeSizeRange,
  type OptimizeSizeEstimate,
} from './optimize-size-estimate.js';
export {
  clampLayoutRect,
  layoutRectToPx,
  layoutStepFraction,
  pdfPointsToMm,
  pxDeltaToLayoutRect,
  snapLayoutRect,
  computeLayoutImageDrawParams,
  normalizeLayoutRotation,
  rotateLayoutObject,
  rotateLayoutPageObject,
  layoutFillToCss,
  isLayoutImageObject,
  isLayoutShapeObject,
  DEFAULT_LAYOUT_SOLID_FILL,
  DEFAULT_LAYOUT_GRADIENT_FILL,
  PDF_POINT_TO_MM,
  type LayoutImageObject,
  type LayoutShapeObject,
  type LayoutPageObject,
  type LayoutFill,
  type LayoutRect,
  type LayoutImageDrawParams,
} from './layout-editor.js';
export {
  BUILTIN_LAYOUT_TEMPLATES,
  applyLayoutTemplateObjects,
  serializePageToTemplate,
  type LayoutTemplateCategory,
  type LayoutTemplateDefinition,
  type LayoutTemplateStoredObject,
} from './layout-bureau-templates.js';
export {
  FOLIO_MEDIA_DRAG_MIME,
  parseFolioMediaDragPayload,
  type FolioMediaDragPayload,
} from './media-drag.js';
export {
  MEDIA_MAX_FILE_BYTES,
  MEDIA_TENANT_QUOTA_BYTES_DEFAULT,
  MEDIA_MAX_PIXEL_SIDE,
  MEDIA_STORE_MAX_PIXEL_SIDE,
  MEDIA_JPEG_QUALITY,
  formatBytesShort,
  type MediaQuotaInfo,
} from './media-limits.js';
export {
  FULL_LAYOUT_CROP,
  LAYOUT_MARGIN_PRESETS,
  getLayoutMarginPreset,
  isFullLayoutCrop,
  layoutGuidesForPreset,
  layoutGuidesFromMargins,
  normalizeLayoutCrop,
  type LayoutMarginPreset,
  type LayoutMarginPresetId,
  type LayoutMarginsMm,
  type LayoutPageGuides,
} from './layout-page-template.js';
export {
  DOCUMENT_REVIEW_STATUSES,
  isDocumentReviewStatus,
  type DocumentReviewStatus,
} from './document-review-status.js';
export {
  DOCUMENT_VERSION_LABELS,
  DOCUMENT_VERSION_LABEL_TITLES,
  isDocumentVersionLabel,
  type DocumentVersionLabel,
} from './version-label.js';
export { UPLOAD_NETWORK_ERROR_MESSAGE } from './user-messages.js';
export type JobStatus = 'queued' | 'active' | 'completed' | 'failed';
export type DocumentVersionStatus = 'pending' | 'ready' | 'failed';
export type PreviewJobPayload = {
  documentVersionId: string;
  s3Key: string;
};
export {
  PRINT_MIN_DPI,
  BOOKLET_EXPORT_DEFAULT_JPEG_DPI,
  BOOKLET_EXPORT_MAX_PAGES,
  type BookletExportImageFormat,
  type PrintReadinessLevel,
  type PrintReadinessImageFinding,
  type PrintReadinessPageFinding,
  type PrintReadinessReport,
  type BookletExportJobResult,
  type PagesExportJobResult,
} from './booklet-export.js';
export {
  LABEL_ARCHIVE_PDF,
  LABEL_ARCHIVE_PDF_HINT,
  MSG_ARCHIVE_PDF_FALLBACK,
  MSG_PROCESSING,
  MSG_PROCESSING_WAIT,
  MSG_NETWORK_STORAGE,
  VERSION_STATUS_LABELS,
  MSG_VERSION_VIEWABLE_WHILE_PROCESSING,
  getVersionStatusLabel,
  getVersionListStatusLabel,
  formatProcessingWaitMessage,
  msgNewVersionStarted,
  HINT_OPTIMIZE_NEW_VERSION,
  HINT_OPTIMIZE_REQUIREMENTS,
  HINT_LAYOUT_SAVE_NEW_VERSION,
  MSG_OPERATION_STARTING,
  MSG_OPTIMIZE_RUNNING,
  MSG_OPTIMIZE_DONE_SUFFIX,
  MSG_OPTIMIZE_NO_CHANGE,
  MSG_OPTIMIZE_NO_TOOLS,
  MSG_OPTIMIZE_SAVED,
  MSG_OPTIMIZE_ASSEMBLED,
  formatOptimizeWaitHint,
  readJobProgressLabel,
  LABEL_GUEST_BOOKLET_ZIP,
  LABEL_GUEST_BOOKLET_ZIP_HINT,
  LABEL_PAGE_REVIEW_SECTION,
  HINT_PAGE_REVIEW_AUTHOR,
  LABEL_PAGE_REVIEW_OK,
  LABEL_PAGE_REVIEW_NEEDS_FIX,
  LABEL_GUEST_PAGE_NEEDS_FIX,
  LABEL_GUEST_PAGE_OK,
  MSG_GUEST_PAGE_NEEDS_FIX,
  LABEL_GUEST_COMMENT_OPEN,
  LABEL_GUEST_COMMENT_RESOLVED,
  LABEL_GUEST_COMMENT_RESOLVED_GUEST,
  LABEL_GUEST_AUTHOR_REPLY,
  HINT_GUEST_RESOLVE_REPLY,
  MSG_GUEST_COMMENT_RESOLVED_AUTHOR,
  PLACEHOLDER_GUEST_RESOLVE_REPLY,
} from './user-labels.js';
export { captionFromFileName } from './caption-from-filename.js';
