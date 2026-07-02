export const FILES_ROOT = 'folioFiles';
export const S3_PREFIX = {
  originals: `${FILES_ROOT}/originals`,
  previews: `${FILES_ROOT}/previews`,
  processing: `${FILES_ROOT}/processing`,
  exports: `${FILES_ROOT}/exports`,
  ragSources: `${FILES_ROOT}/rag-sources`,
  media: `${FILES_ROOT}/media`,
} as const;
export type S3PrefixKey = keyof typeof S3_PREFIX;
export function resolveS3Key(prefix: S3PrefixKey, fileName: string): string {
  const folder = S3_PREFIX[prefix];
  return `${folder}/${fileName.replace(/^\/+/, '')}`;
}
export function previewPageKey(documentId: string, versionId: string, page: number): string {
  return resolveS3Key('previews', `${documentId}/${versionId}/page-${page}.png`);
}

export function previewPageThumbKey(documentId: string, versionId: string, page: number): string {
  return previewPageKey(documentId, versionId, page);
}

export function previewPageViewKey(documentId: string, versionId: string, page: number): string {
  return resolveS3Key('previews', `${documentId}/${versionId}/page-${page}-view.png`);
}
export type PreviewPageVariant = 'thumb' | 'view';
export function previewPageKeyForVariant(
  documentId: string,
  versionId: string,
  page: number,
  variant: PreviewPageVariant,
): string {
  return variant === 'view'
    ? previewPageViewKey(documentId, versionId, page)
    : previewPageThumbKey(documentId, versionId, page);
}
export function extractedTextKey(documentId: string, versionId: string): string {
  return resolveS3Key('processing', `${documentId}/${versionId}/text.json`);
}
export function preConvertedDocxKey(documentId: string, versionId: string): string {
  return resolveS3Key('processing', `${documentId}/${versionId}/pre-converted.docx`);
}
export function appliedDocxKey(documentId: string, versionId: string): string {
  return resolveS3Key('processing', `${documentId}/${versionId}/applied.docx`);
}
export function exportReportKey(documentId: string, versionId: string): string {
  return resolveS3Key('exports', `${documentId}/${versionId}/report.md`);
}
export function exportReportWordKey(documentId: string, versionId: string): string {
  return resolveS3Key('exports', `${documentId}/${versionId}/report.doc`);
}
export function exportReportPdfKey(documentId: string, versionId: string): string {
  return resolveS3Key('exports', `${documentId}/${versionId}/report.pdf`);
}
export function highlightEditsDocxKey(documentId: string, versionId: string): string {
  return resolveS3Key('exports', `${documentId}/${versionId}/edits-highlight.docx`);
}
export function assertS3KeyUnderFilesRoot(key: string): void {
  const normalized = key.replace(/^\/+/, '');
  if (normalized === 'pending') return;
  if (!normalized.startsWith(`${FILES_ROOT}/`)) {
    throw new Error(`S3 key must start with ${FILES_ROOT}/ (got: ${key})`);
  }
}
