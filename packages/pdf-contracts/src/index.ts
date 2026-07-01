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
  resolveS3Key,
  type S3PrefixKey,
} from './s3-paths.js';
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
export { UPLOAD_NETWORK_ERROR_MESSAGE } from './user-messages.js';
export type JobStatus = 'queued' | 'active' | 'completed' | 'failed';
export type DocumentVersionStatus = 'pending' | 'ready' | 'failed';
export type PreviewJobPayload = {
  documentVersionId: string;
  s3Key: string;
};
