export type PdfPageAcceptedEdit = {
  id: string;
  page: number;
  before: string;
  after: string;
};
export function acceptedEditsForPage(
  edits: PdfPageAcceptedEdit[],
  pageNumber: number,
): PdfPageAcceptedEdit[] {
  return edits.filter((e) => e.page === pageNumber);
}
export function truncateOverlayText(text: string, maxLen: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLen) return normalized;
  return `${normalized.slice(0, maxLen - 1)}…`;
}
