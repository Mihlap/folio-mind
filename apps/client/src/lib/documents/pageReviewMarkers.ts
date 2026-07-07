import {
  LABEL_PAGE_REVIEW_NEEDS_FIX,
  LABEL_PAGE_REVIEW_OK,
} from '@folio-mind/store';
import type { PageReviewMark } from '@folio-mind/store';
import type { PdfPageMarker } from '@folio-mind/ui';

export type PageReviewMarkStatus = 'ok' | 'needs_fix';

export function pageReviewMarksByPage(
  items: Array<{ page: number; status: PageReviewMarkStatus }>,
): Record<number, PageReviewMarkStatus> {
  const map: Record<number, PageReviewMarkStatus> = {};
  for (const item of items) {
    map[item.page] = item.status;
  }
  return map;
}

export function pageReviewMarksToPageMarkers(items: PageReviewMark[]): PdfPageMarker[] {
  return items.map((item) => ({
    id: `page-review-${item.page}`,
    page: item.page,
    kind: item.status === 'needs_fix' ? 'page_review_fix' : 'page_review_ok',
    title: item.status === 'needs_fix' ? LABEL_PAGE_REVIEW_NEEDS_FIX : LABEL_PAGE_REVIEW_OK,
  }));
}
