export {
  FILES_ROOT,
  S3_PREFIX,
  assertS3KeyUnderFilesRoot,
  extractedTextKey,
  exportReportPdfKey,
  exportReportKey,
  exportReportWordKey,
  previewPageKey,
  resolveS3Key,
  type S3PrefixKey,
} from './s3-paths.js';

export {
  normalizePageTexts,
  parseExtractedTextJson,
  type ExtractedDocumentText,
  type PageText,
} from './extracted-text.js';

export {
  compareVersionTexts,
  diffPageLines,
  type PageDiffStatus,
  type PageTextDiff,
  type TextDiffLine,
  type VersionTextCompareResult,
  type VersionTextCompareSummary,
} from './text-diff.js';

export type JobStatus = 'queued' | 'active' | 'completed' | 'failed';

export type DocumentVersionStatus = 'pending' | 'ready' | 'failed';

export type PreviewJobPayload = {
  documentVersionId: string;
  s3Key: string;
};
