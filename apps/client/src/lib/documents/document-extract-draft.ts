export type DocumentExtractDraft = {
  extracted: Record<string, unknown>;
  templateTitle: string | null;
  templateId: 'contract' | 'contract_sections' | 'act' | 'tz' | null;
  viewFormat: 'fields' | 'json';
  collapsed: boolean;
};

function storageKey(versionId: string): string {
  return `folio-document-extract:${versionId}`;
}

function isTemplateId(
  value: unknown,
): value is 'contract' | 'contract_sections' | 'act' | 'tz' {
  return (
    value === 'contract' ||
    value === 'contract_sections' ||
    value === 'act' ||
    value === 'tz'
  );
}

export function loadDocumentExtractDraft(versionId: string): DocumentExtractDraft | null {
  if (typeof window === 'undefined' || !versionId) return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey(versionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DocumentExtractDraft>;
    if (!parsed.extracted || typeof parsed.extracted !== 'object' || Array.isArray(parsed.extracted)) {
      return null;
    }
    return {
      extracted: parsed.extracted as Record<string, unknown>,
      templateTitle: typeof parsed.templateTitle === 'string' ? parsed.templateTitle : null,
      templateId: isTemplateId(parsed.templateId) ? parsed.templateId : null,
      viewFormat: parsed.viewFormat === 'json' ? 'json' : 'fields',
      collapsed: parsed.collapsed === true,
    };
  } catch {
    return null;
  }
}

export function saveDocumentExtractDraft(versionId: string, draft: DocumentExtractDraft): void {
  if (typeof window === 'undefined' || !versionId) return;
  try {
    window.sessionStorage.setItem(storageKey(versionId), JSON.stringify(draft));
  } catch {
    /* ignore quota */
  }
}

export function clearDocumentExtractDraft(versionId: string): void {
  if (typeof window === 'undefined' || !versionId) return;
  try {
    window.sessionStorage.removeItem(storageKey(versionId));
  } catch {
    /* ignore */
  }
}
