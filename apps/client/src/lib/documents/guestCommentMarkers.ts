import type { GuestShareComment } from '@folio-mind/store';
import type { PdfPageMarker } from '@folio-mind/ui';

const MAX_TITLE_LEN = 80;

function truncateTitle(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= MAX_TITLE_LEN) return normalized;
  return `${normalized.slice(0, MAX_TITLE_LEN - 1)}…`;
}

export function guestCommentsToPageMarkers(
  items: GuestShareComment[],
  options?: { openOnly?: boolean },
): PdfPageMarker[] {
  const filtered = options?.openOnly ? items.filter((item) => item.status === 'open') : items;
  return filtered.map((item) => ({
    id: item.id,
    page: item.page,
    kind: 'guest_comment',
    title: truncateTitle(item.content),
    ...(item.x != null && item.y != null ? { xNorm: item.x, yNorm: item.y } : {}),
  }));
}
