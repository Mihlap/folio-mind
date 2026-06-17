export type PdfPageMarkerKind = 'comment' | 'highlight' | 'accepted_edit' | string;

export type PdfPageMarker = {
  id: string;
  page: number;
  kind: PdfPageMarkerKind;
  /** Короткий текст для tooltip */
  title: string;
  /** Позиция на странице в долях (0-1) от ширины/высоты страницы. */
  x?: number;
  y?: number;
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
    default:
      return 'bg-amber-500 ring-amber-200 hover:bg-amber-600';
  }
}
