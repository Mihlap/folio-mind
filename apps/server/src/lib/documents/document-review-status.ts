import { isDocumentReviewStatus, type DocumentReviewStatus } from '@folio-mind/pdf-contracts';

export function toDocumentReviewStatus(value: string): DocumentReviewStatus {
  return isDocumentReviewStatus(value) ? value : 'draft';
}
