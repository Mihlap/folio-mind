import { markerKindClass, markerKindLabel, type PdfPageMarker } from '../pdf-page-markers.js';

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

function GuestCommentPin({
  marker,
  point,
  active,
  onMarkerClick,
}: {
  marker: PdfPageMarker;
  point: { x: number; y: number };
  active: boolean;
  onMarkerClick?: (marker: PdfPageMarker) => void;
}) {
  return (
    <div
      className="pointer-events-none absolute z-10"
      style={{ left: point.x, top: point.y }}
    >
      <button
        type="button"
        title={marker.title}
        onClick={() => onMarkerClick?.(marker)}
        className={[
          'pointer-events-auto absolute flex max-w-[min(14rem,42vw)] -translate-x-1/2 -translate-y-full flex-col items-center',
          active ? 'z-20' : 'z-10',
        ].join(' ')}
        style={{ marginTop: -6 }}
      >
        <span
          className={[
            'w-full rounded-lg border-2 bg-white px-2.5 py-1.5 text-left shadow-lg transition',
            active
              ? 'border-sky-600 ring-2 ring-sky-200'
              : 'border-sky-500 hover:border-sky-600 hover:shadow-xl',
          ].join(' ')}
        >
          <span className="block text-[9px] font-bold uppercase tracking-wide text-sky-600">
            {markerKindLabel(marker.kind)}
          </span>
          <span className="mt-0.5 block line-clamp-3 text-[11px] font-medium leading-snug text-slate-800">
            {marker.title}
          </span>
        </span>
        <span className="my-0.5 h-2.5 w-0.5 shrink-0 bg-sky-500" aria-hidden />
        <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
          <span
            className={[
              'absolute inset-0 rounded-full bg-sky-400/50',
              active ? 'animate-ping' : 'animate-pulse',
            ].join(' ')}
            aria-hidden
          />
          <span className="relative h-4 w-4 rounded-full border-2 border-white bg-sky-500 shadow-md" />
        </span>
      </button>
    </div>
  );
}

function DefaultPositionedPin({
  marker,
  point,
  active,
  onMarkerClick,
}: {
  marker: PdfPageMarker;
  point: { x: number; y: number };
  active: boolean;
  onMarkerClick?: (marker: PdfPageMarker) => void;
}) {
  return (
    <button
      key={marker.id}
      type="button"
      title={marker.title}
      onClick={() => onMarkerClick?.(marker)}
      className={[
        'pointer-events-auto absolute flex max-w-[10rem] -translate-x-1/2 -translate-y-1/2 cursor-pointer flex-col items-center gap-0.5',
        markerKindClass(marker.kind),
        active ? 'z-20 scale-110' : 'z-10',
      ].join(' ')}
      style={{ left: point.x, top: point.y }}
    >
      <span className="rounded-full px-2 py-0.5 text-[10px] font-medium text-white shadow-sm ring-2 ring-white/80">
        {marker.title}
      </span>
      <span className="h-3 w-3 rounded-full border-2 border-white bg-inherit shadow" aria-hidden />
    </button>
  );
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
    <div className="pointer-events-none absolute inset-0 z-10 overflow-visible" aria-label="Заметки на странице">
      {positioned.map(({ marker, point }) => {
        const active = marker.id === activeMarkerId;
        if (marker.kind === 'guest_comment') {
          return (
            <GuestCommentPin
              key={marker.id}
              marker={marker}
              point={point}
              active={active}
              onMarkerClick={onMarkerClick}
            />
          );
        }
        return (
          <DefaultPositionedPin
            key={marker.id}
            marker={marker}
            point={point}
            active={active}
            onMarkerClick={onMarkerClick}
          />
        );
      })}
      {unpositioned.length > 0 && (
        <div className="pointer-events-auto absolute top-2 right-2 flex max-w-[min(52%,15rem)] flex-col items-end gap-1.5">
          {visible.map((marker) => {
            const active = marker.id === activeMarkerId;
            const isGuest = marker.kind === 'guest_comment';
            return (
              <button
                key={marker.id}
                type="button"
                title={marker.title}
                onClick={() => onMarkerClick?.(marker)}
                className={[
                  'flex max-w-full cursor-pointer items-start gap-1.5 rounded-lg px-2 py-1.5 text-left shadow-md ring-2 transition',
                  isGuest
                    ? 'border-2 border-sky-500 bg-white hover:bg-sky-50'
                    : markerKindClass(marker.kind),
                  active ? 'scale-105 ring-2 ring-sky-300' : 'ring-transparent',
                ].join(' ')}
              >
                {!isGuest && (
                  <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-white/90" aria-hidden />
                )}
                <span className="min-w-0">
                  {isGuest && (
                    <span className="block text-[9px] font-bold uppercase tracking-wide text-sky-600">
                      {markerKindLabel(marker.kind)}
                    </span>
                  )}
                  <span
                    className={[
                      'block truncate font-medium leading-tight',
                      isGuest ? 'text-[11px] text-slate-800' : 'text-[10px] text-white',
                    ].join(' ')}
                  >
                    {marker.title}
                  </span>
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
