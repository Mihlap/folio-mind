export const FOLIO_MEDIA_DRAG_MIME = 'application/x-folio-media-asset';

export type FolioMediaDragPayload = {
  assetId: string;
  title: string;
};

export function parseFolioMediaDragPayload(raw: string): FolioMediaDragPayload | null {
  try {
    const parsed = JSON.parse(raw) as FolioMediaDragPayload;
    if (typeof parsed.assetId === 'string' && parsed.assetId.trim()) {
      return { assetId: parsed.assetId.trim(), title: String(parsed.title ?? '') };
    }
  } catch {
    // Invalid drag payloads are ignored by design.
  }
  return null;
}
