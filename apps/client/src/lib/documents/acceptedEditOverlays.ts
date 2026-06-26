import type { DocumentAnnotation } from '@folio-mind/store';
export function listAcceptedEditAnnotations(items: DocumentAnnotation[]): DocumentAnnotation[] {
  return items.filter((a) => a.kind === 'accepted_edit');
}
export function countAcceptedEditsByPage(items: DocumentAnnotation[]): Record<number, number> {
  const counts: Record<number, number> = {};
  for (const a of items) {
    if (a.kind !== 'accepted_edit' || !a.quote?.trim()) continue;
    counts[a.page] = (counts[a.page] ?? 0) + 1;
  }
  return counts;
}
