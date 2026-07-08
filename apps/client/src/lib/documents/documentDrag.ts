import {
  FOLIO_DOCUMENT_DRAG_MIME,
  parseFolioDocumentDragPayload,
  type FolioDocumentDragPayload,
} from '@folio-mind/store';
import type { DragEvent } from 'react';

export function startDocumentDrag(
  event: DragEvent,
  document: { id: string; title: string },
): void {
  event.dataTransfer.setData(
    FOLIO_DOCUMENT_DRAG_MIME,
    JSON.stringify({ documentId: document.id, title: document.title }),
  );
  event.dataTransfer.effectAllowed = 'move';
}

export function readDocumentDragPayload(event: DragEvent): FolioDocumentDragPayload | null {
  const raw = event.dataTransfer.getData(FOLIO_DOCUMENT_DRAG_MIME);
  return raw ? parseFolioDocumentDragPayload(raw) : null;
}

export function isDocumentDragEvent(event: DragEvent): boolean {
  return event.dataTransfer.types.includes(FOLIO_DOCUMENT_DRAG_MIME);
}

export function allowDocumentDrop(event: DragEvent): void {
  if (!isDocumentDragEvent(event)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
}
