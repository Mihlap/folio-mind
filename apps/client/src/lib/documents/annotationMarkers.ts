import type { DocumentAnnotation } from '@folio-mind/store';
import type { PdfPageMarker } from '@folio-mind/ui';
const MAX_TITLE_LEN = 40;
function truncateTitle(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= MAX_TITLE_LEN) return normalized;
  return `${normalized.slice(0, MAX_TITLE_LEN - 1)}…`;
}
export function annotationsToPageMarkers(items: DocumentAnnotation[]): PdfPageMarker[] {
  return items.map((item) => ({
    id: item.id,
    page: item.page,
    kind: item.kind,
    title: truncateTitle(item.content),
    ...(item.x != null && item.y != null ? { x: item.x, y: item.y } : {}),
  }));
}
