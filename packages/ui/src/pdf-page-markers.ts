export type PdfPageMarkerKind = 'comment' | 'highlight' | 'accepted_edit' | string;
export type PdfPageMarker = {
  id: string;
  page: number;
  kind: PdfPageMarkerKind;
  title: string;
  /** Позиция в пикселях на отрендеренной странице */
  x?: number;
  y?: number;
  /** Нормализованная позиция 0–1 (гостевые метки) */
  xNorm?: number;
  yNorm?: number;
};
export function markersForPage(markers: PdfPageMarker[], pageNumber: number): PdfPageMarker[] {
  return markers.filter((m) => m.page === pageNumber);
}
export function markerKindClass(kind: PdfPageMarkerKind): string {
  switch (kind) {
    case 'accepted_edit':
      return 'bg-red-400 ring-red-200 hover:bg-red-500';
    case 'highlight':
      return 'bg-yellow-400 ring-yellow-200 hover:bg-yellow-500';
    case 'guest_comment':
      return 'bg-sky-500 ring-sky-200 hover:bg-sky-600';
    case 'page_review_ok':
      return 'bg-emerald-500 ring-emerald-200 hover:bg-emerald-600';
    case 'page_review_fix':
      return 'bg-amber-500 ring-amber-200 hover:bg-amber-600';
    case 'internal_arrow':
      return 'bg-violet-500 ring-violet-200 hover:bg-violet-600';
    case 'internal_frame':
      return 'bg-fuchsia-500 ring-fuchsia-200 hover:bg-fuchsia-600';
    default:
      return 'bg-amber-500 ring-amber-200 hover:bg-amber-600';
  }
}

export function markerKindLabel(kind: PdfPageMarkerKind): string {
  switch (kind) {
    case 'guest_comment':
      return 'Замечание';
    case 'accepted_edit':
      return 'Правка';
    case 'page_review_ok':
      return 'ОК';
    case 'page_review_fix':
      return 'Правки';
    default:
      return 'Заметка';
  }
}
