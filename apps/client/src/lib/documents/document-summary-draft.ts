export type DocumentSummaryDraft = {
  summary: string;
  collapsed: boolean;
};

function storageKey(versionId: string): string {
  return `folio-document-summary:${versionId}`;
}

export function loadDocumentSummaryDraft(versionId: string): DocumentSummaryDraft | null {
  if (typeof window === 'undefined' || !versionId) return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey(versionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DocumentSummaryDraft>;
    if (typeof parsed.summary !== 'string' || !parsed.summary.trim()) return null;
    return {
      summary: parsed.summary,
      collapsed: parsed.collapsed === true,
    };
  } catch {
    return null;
  }
}

export function saveDocumentSummaryDraft(versionId: string, draft: DocumentSummaryDraft): void {
  if (typeof window === 'undefined' || !versionId) return;
  try {
    window.sessionStorage.setItem(storageKey(versionId), JSON.stringify(draft));
  } catch {
    /* ignore quota */
  }
}

export function clearDocumentSummaryDraft(versionId: string): void {
  if (typeof window === 'undefined' || !versionId) return;
  try {
    window.sessionStorage.removeItem(storageKey(versionId));
  } catch {
    /* ignore */
  }
}
