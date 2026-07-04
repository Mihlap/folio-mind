export {
  FILES_ROOT,
  S3_PREFIX,
  assertS3KeyUnderFilesRoot,
  extractedTextKey,
  exportReportPdfKey,
  exportReportKey,
  exportReportWordKey,
  highlightEditsDocxKey,
  preConvertedDocxKey,
  appliedDocxKey,
  previewPageKey,
  previewPageThumbKey,
  previewPageViewKey,
  mediaAssetKey,
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
export { UPLOAD_NETWORK_ERROR_MESSAGE } from './user-messages.js';
export type JobStatus = 'queued' | 'active' | 'completed' | 'failed';
export type DocumentVersionStatus = 'pending' | 'ready' | 'failed';
export type PreviewJobPayload = {
  documentVersionId: string;
  s3Key: string;
};
