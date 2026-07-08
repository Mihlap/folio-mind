export const FOLIO_DOCUMENT_DRAG_MIME = 'application/x-folio-document';

export type FolioDocumentDragPayload = {
  documentId: string;
  title: string;
};

export function parseFolioDocumentDragPayload(raw: string): FolioDocumentDragPayload | null {
  try {
    const parsed = JSON.parse(raw) as FolioDocumentDragPayload;
    if (typeof parsed.documentId === 'string' && parsed.documentId.trim()) {
      return {
        documentId: parsed.documentId.trim(),
        title: String(parsed.title ?? ''),
      };
    }
  } catch {
    /* invalid payload */
  }
  return null;
}
