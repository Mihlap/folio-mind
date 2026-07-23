export type DocumentRagCompareDraft = {
  report: string;
  collapsed: boolean;
};

function storageKey(versionId: string): string {
  return `folio-document-rag-compare:${versionId}`;
}

export function loadDocumentRagCompareDraft(versionId: string): DocumentRagCompareDraft | null {
  if (typeof window === 'undefined' || !versionId) return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey(versionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DocumentRagCompareDraft>;
    if (typeof parsed.report !== 'string' || !parsed.report.trim()) return null;
    return {
      report: parsed.report,
      collapsed: parsed.collapsed === true,
    };
  } catch {
    return null;
  }
}

export function saveDocumentRagCompareDraft(
  versionId: string,
  draft: DocumentRagCompareDraft,
): void {
  if (typeof window === 'undefined' || !versionId) return;
  try {
    window.sessionStorage.setItem(storageKey(versionId), JSON.stringify(draft));
  } catch {
    /* ignore quota */
  }
}

export function clearDocumentRagCompareDraft(versionId: string): void {
  if (typeof window === 'undefined' || !versionId) return;
  try {
    window.sessionStorage.removeItem(storageKey(versionId));
  } catch {
    /* ignore */
  }
}
