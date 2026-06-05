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
};

function suggestionIdFromMeta(meta: unknown): string | null {
  if (!meta || typeof meta !== 'object') return null;
  const id = (meta as { suggestionId?: unknown }).suggestionId;
  return typeof id === 'string' ? id : null;
}

/** Собирает правки для приложения PDF: ИИ (accepted) + ручные accepted_edit без дубликатов */
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
    });
  }

  edits.sort((a, b) => a.page - b.page || a.originalText.localeCompare(b.originalText, 'ru'));
  return edits;
}
