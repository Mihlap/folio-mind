export const DOCUMENT_REVIEW_STATUSES = ['draft', 'in_review', 'approved'] as const;

export type DocumentReviewStatus = (typeof DOCUMENT_REVIEW_STATUSES)[number];

export function isDocumentReviewStatus(value: string): value is DocumentReviewStatus {
  return (DOCUMENT_REVIEW_STATUSES as readonly string[]).includes(value);
}
