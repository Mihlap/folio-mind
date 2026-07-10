import { readAcceptedEditContentFormat, type EditContentFormat } from '@folio-mind/edit-markdown';

type AiAcceptedRow = {
  id: string;
  page: number | null;
  originalText: string;
  suggestion: string;
};
type AnnotationRow = {
  page: number;
  content: string;
  quote: string | null;
  meta: unknown;
};
export type CollectedAcceptedEdit = {
  page: number;
  originalText: string;
  suggestion: string;
  contentFormat?: EditContentFormat;
  anchor?: { xNorm: number; yNorm: number };
};
function pageAnchorFromMeta(meta: unknown): { xNorm: number; yNorm: number } | undefined {
  if (!meta || typeof meta !== 'object') return undefined;
  const anchor = (meta as { pageAnchor?: { xNorm?: unknown; yNorm?: unknown } }).pageAnchor;
  if (
    anchor &&
    typeof anchor.xNorm === 'number' &&
    typeof anchor.yNorm === 'number' &&
    Number.isFinite(anchor.xNorm) &&
    Number.isFinite(anchor.yNorm)
  ) {
    return { xNorm: anchor.xNorm, yNorm: anchor.yNorm };
  }
  return undefined;
}
function suggestionIdFromMeta(meta: unknown): string | null {
  if (!meta || typeof meta !== 'object') return null;
  const id = (
    meta as {
      suggestionId?: unknown;
    }
  ).suggestionId;
  return typeof id === 'string' ? id : null;
}
export function collectAcceptedEditsForPdf(
  aiAccepted: AiAcceptedRow[],
  annotations: AnnotationRow[],
): CollectedAcceptedEdit[] {
  const linkedSuggestionIds = new Set<string>();
  const edits: CollectedAcceptedEdit[] = [];
  for (const row of aiAccepted) {
    linkedSuggestionIds.add(row.id);
    edits.push({
      page: row.page && row.page >= 1 ? row.page : 1,
      originalText: row.originalText,
      suggestion: row.suggestion,
    });
  }
  for (const row of annotations) {
    const quote = row.quote?.trim() ?? '';
    const content = row.content.trim();
    if (!quote || !content) continue;
    const suggestionId = suggestionIdFromMeta(row.meta);
    if (suggestionId && linkedSuggestionIds.has(suggestionId)) continue;
    edits.push({
      page: row.page >= 1 ? row.page : 1,
      originalText: quote,
      suggestion: content,
      contentFormat: readAcceptedEditContentFormat(row.meta),
      anchor: pageAnchorFromMeta(row.meta),
    });
  }
  edits.sort((a, b) => a.page - b.page || a.originalText.localeCompare(b.originalText, 'ru'));
  return edits;
}
