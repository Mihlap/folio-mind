import { markerKindClass, type PdfPageMarker } from '../pdf-page-markers.js';

type PageMarkersOverlayProps = {
  pageNumber: number;
  markers: PdfPageMarker[];
  pageWidthPx?: number;
  pageHeightPx?: number;
  activeMarkerId?: string | null;
  onMarkerClick?: (marker: PdfPageMarker) => void;
  onOverflowClick?: (page: number) => void;
};

function resolveMarkerPx(
  marker: PdfPageMarker,
  pageWidthPx: number,
  pageHeightPx: number,
): { x: number; y: number } | null {
  if (marker.x != null && marker.y != null) {
    return { x: marker.x, y: marker.y };
  }
  if (
    marker.xNorm != null &&
    marker.yNorm != null &&
    pageWidthPx > 0 &&
    pageHeightPx > 0
  ) {
    return {
      x: marker.xNorm * pageWidthPx,
      y: marker.yNorm * pageHeightPx,
    };
  }
  return null;
}

export function PageMarkersOverlay({
  pageNumber,
  markers,
  pageWidthPx = 0,
  pageHeightPx = 0,
  activeMarkerId,
  onMarkerClick,
  onOverflowClick,
}: PageMarkersOverlayProps) {
  const maxVisible = 3;
  const positioned = markers
    .map((marker) => {
      const point = resolveMarkerPx(marker, pageWidthPx, pageHeightPx);
      return point ? { marker, point } : null;
    })
    .filter((item): item is { marker: PdfPageMarker; point: { x: number; y: number } } => item != null);
  const unpositioned = markers.filter(
    (marker) => resolveMarkerPx(marker, pageWidthPx, pageHeightPx) == null,
  );
  const visible = unpositioned.slice(0, maxVisible);
  const overflow = markers.length - visible.length - positioned.length;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden" aria-label="Заметки на странице">
      {positioned.map(({ marker, point }) => {
        const active = marker.id === activeMarkerId;
        return (
          <button
            key={marker.id}
            type="button"
            title={marker.title}
            onClick={() => onMarkerClick?.(marker)}
            className={[
              'pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full px-1.5 py-0.5 text-left shadow-sm ring-2 transition',
              markerKindClass(marker.kind),
              active ? 'scale-110 ring-2 ring-white animate-pulse z-20' : 'ring-transparent z-10',
            ].join(' ')}
            style={{ left: `${point.x}px`, top: `${point.y}px` }}
          >
            <span className="h-2 w-2 shrink-0 rounded-full bg-white/90" aria-hidden />
          </button>
        );
      })}
      {unpositioned.length > 0 && (
        <div className="pointer-events-auto absolute top-2 right-2 flex max-w-[min(52%,15rem)] flex-col items-end gap-1.5">
          {visible.map((marker) => {
            const active = marker.id === activeMarkerId;
            return (
              <button
                key={marker.id}
                type="button"
                title={marker.title}
                onClick={() => onMarkerClick?.(marker)}
                className={[
                  'flex max-w-full cursor-pointer items-center gap-1 rounded-full px-1.5 py-0.5 text-left shadow-sm ring-2 transition',
                  markerKindClass(marker.kind),
                  active ? 'scale-110 ring-2 ring-white animate-pulse' : 'ring-transparent',
                ].join(' ')}
              >
                <span className="h-2 w-2 shrink-0 rounded-full bg-white/90" aria-hidden />
                <span className="truncate text-[10px] font-medium leading-tight text-white">
                  {marker.title}
                </span>
              </button>
            );
          })}
          {overflow > 0 && (
            <button
              type="button"
              title={`Ещё ${overflow + positioned.length} заметок на стр. ${pageNumber}`}
              onClick={() => onOverflowClick?.(pageNumber)}
              className="cursor-pointer rounded-full border border-slate-200 bg-white/95 px-2.5 py-1 text-[10px] font-medium text-slate-700 shadow-sm ring-1 ring-white/90 hover:border-slate-300 hover:bg-slate-50"
            >
              +{overflow + positioned.length} заметок
            </button>
          )}
        </div>
      )}
    </div>
  );
}
