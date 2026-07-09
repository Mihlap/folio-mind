import { readContentFormat } from '@folio-mind/edit-markdown';

type AnnotationRow = {
  id: string;
  documentId: string;
  versionId: string;
  userId: string;
  page: number;
  kind: string;
  content: string;
  quote: string | null;
  x: number | null;
  y: number | null;
  meta: unknown;
  createdAt: Date;
  updatedAt: Date;
};

export function serializeDocumentAnnotation(item: AnnotationRow) {
  return {
    id: item.id,
    documentId: item.documentId,
    versionId: item.versionId,
    userId: item.userId,
    page: item.page,
    kind: item.kind,
    content: item.content,
    quote: item.quote,
    contentFormat: readContentFormat(item.meta),
    x: item.x,
    y: item.y,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}
