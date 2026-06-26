import { markerKindClass, type PdfPageMarker } from '../pdf-page-markers.js';

type PageMarkersOverlayProps = {
  pageNumber: number;
  markers: PdfPageMarker[];
  activeMarkerId?: string | null;
  onMarkerClick?: (marker: PdfPageMarker) => void;
  onOverflowClick?: (page: number) => void;
};

export function PageMarkersOverlay({
  pageNumber,
  markers,
  activeMarkerId,
  onMarkerClick,
  onOverflowClick,
}: PageMarkersOverlayProps) {
  const maxVisible = 3;
  const positioned = markers.filter((m) => m.x != null && m.y != null);
  const unpositioned = markers.filter((m) => m.x == null || m.y == null);
  const visible = unpositioned.slice(0, maxVisible);
  const overflow = markers.length - visible.length - positioned.length;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden" aria-label="Заметки на странице">
      {positioned.map((marker) => {
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
            style={{ left: `${marker.x!}px`, top: `${marker.y!}px` }}
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
