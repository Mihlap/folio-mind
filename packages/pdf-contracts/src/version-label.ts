export const DOCUMENT_VERSION_LABELS = ['draft', 'in_review', 'final'] as const;

export type DocumentVersionLabel = (typeof DOCUMENT_VERSION_LABELS)[number];

export const DOCUMENT_VERSION_LABEL_TITLES: Record<DocumentVersionLabel, string> = {
  draft: 'Черновик',
  in_review: 'На согласовании',
  final: 'Финал',
};

export function isDocumentVersionLabel(value: string): value is DocumentVersionLabel {
  return (DOCUMENT_VERSION_LABELS as readonly string[]).includes(value);
}
