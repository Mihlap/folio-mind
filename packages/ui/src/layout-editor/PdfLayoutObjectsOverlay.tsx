import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  clampLayoutRect,
  layoutRectToPx,
  normalizeLayoutCrop,
  snapLayoutRect,
  type LayoutImageObject,
  type LayoutRect,
} from '@folio-mind/pdf-contracts';
import { resizeLayoutRect, type LayoutResizeHandle } from './layout-utils.js';

type DragState =
  | { kind: 'move'; id: string; startX: number; startY: number; origin: LayoutRect }
  | {
      kind: 'resize';
      id: string;
      handle: LayoutResizeHandle;
      startX: number;
      startY: number;
      origin: LayoutRect;
    }
  | {
      kind: 'crop-resize';
      id: string;
      handle: LayoutResizeHandle;
      startX: number;
      startY: number;
      origin: LayoutRect;
      boxWidthPx: number;
      boxHeightPx: number;
    };

type Props = {
  pageNumber: number;
  pageWidthPx: number;
  pageHeightPx: number;
  objects: LayoutImageObject[];
  selectedId: string | null;
  cropMode: boolean;
  snapStep: number;
  onSelect: (id: string | null) => void;
  onObjectChange: (id: string, rect: LayoutRect) => void;
  onObjectCropChange: (id: string, crop: LayoutRect) => void;
};

const FRAME_HANDLES = ['nw', 'ne', 'sw', 'se'] as const;
const HANDLE_CLASS =
  'pointer-events-auto absolute z-50 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md';

function rectFromDrag(
  drag: Extract<DragState, { kind: 'move' } | { kind: 'resize' }>,
  event: PointerEvent,
  pageWidthPx: number,
  pageHeightPx: number,
): LayoutRect {
  const dxFrac = (event.clientX - drag.startX) / pageWidthPx;
  const dyFrac = (event.clientY - drag.startY) / pageHeightPx;
  if (drag.kind === 'move') {
    return clampLayoutRect({
      ...drag.origin,
      x: drag.origin.x + dxFrac,
      y: drag.origin.y + dyFrac,
    });
  }
  return clampLayoutRect(resizeLayoutRect(drag.origin, drag.handle, dxFrac, dyFrac));
}

function cropFromDrag(
  drag: Extract<DragState, { kind: 'crop-resize' }>,
  event: PointerEvent,
): LayoutRect {
  const dxFrac = (event.clientX - drag.startX) / drag.boxWidthPx;
  const dyFrac = (event.clientY - drag.startY) / drag.boxHeightPx;
  return clampLayoutRect(resizeLayoutRect(drag.origin, drag.handle, dxFrac, dyFrac), 0.05);
}

export function PdfLayoutObjectsOverlay({
  pageNumber,
  pageWidthPx,
  pageHeightPx,
  objects,
  selectedId,
  cropMode,
  snapStep,
  onSelect,
  onObjectChange,
  onObjectCropChange,
}: Props) {
  const dragRef = useRef<DragState | null>(null);
  const onObjectChangeRef = useRef(onObjectChange);
  const onObjectCropChangeRef = useRef(onObjectCropChange);
  const snapStepRef = useRef(snapStep);
  const pageSizeRef = useRef({ pageWidthPx, pageHeightPx });
  const [draggingId, setDraggingId] = useState<string | null>(null);

  onObjectChangeRef.current = onObjectChange;
  onObjectCropChangeRef.current = onObjectCropChange;
  snapStepRef.current = snapStep;
  pageSizeRef.current = { pageWidthPx, pageHeightPx };

  const pageObjects = objects.filter((o) => Number(o.page) === pageNumber);

  const finishPointer = useCallback(() => {
    dragRef.current = null;
    setDraggingId(null);
  }, []);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      const { pageWidthPx: w, pageHeightPx: h } = pageSizeRef.current;
      if (!drag || w <= 0 || h <= 0) return;
      event.preventDefault();

      if (drag.kind === 'crop-resize') {
        onObjectCropChangeRef.current(drag.id, cropFromDrag(drag, event));
        return;
      }

      onObjectChangeRef.current(drag.id, rectFromDrag(drag, event, w, h));
    };

    const onUp = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const { pageWidthPx: w, pageHeightPx: h } = pageSizeRef.current;
      const step = snapStepRef.current;
      if (w > 0 && h > 0 && drag.kind !== 'crop-resize') {
        const next = rectFromDrag(drag, event, w, h);
        if (drag.kind === 'move' && step > 0) {
          onObjectChangeRef.current(drag.id, snapLayoutRect(next, step));
        } else {
          onObjectChangeRef.current(drag.id, next);
        }
      }
      if (drag.kind === 'crop-resize') {
        const next = cropFromDrag(drag, event);
        if (step > 0) {
          onObjectCropChangeRef.current(drag.id, snapLayoutRect(next, step, 0.05));
        } else {
          onObjectCropChangeRef.current(drag.id, next);
        }
      }

      finishPointer();
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [finishPointer]);

  if (pageObjects.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[20]" aria-label="Объекты макета">
      {pageObjects.map((object) => {
        const px = layoutRectToPx(object.rect, pageWidthPx, pageHeightPx);
        const selected = object.id === selectedId;
        const crop = normalizeLayoutCrop(object.crop);
        const showCropHandles = selected && cropMode;
        return (
          <div
            key={object.id}
            className={[
              'pointer-events-auto absolute touch-none',
              draggingId === object.id ? 'z-30' : 'z-20',
              selected ? 'cursor-move' : 'cursor-pointer',
            ].join(' ')}
            data-layout-object=""
            style={{
              left: px.left,
              top: px.top,
              width: px.width,
              height: px.height,
            }}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              if ((event.target as HTMLElement).closest('[data-layout-handle]')) return;
              event.preventDefault();
              event.stopPropagation();
              event.currentTarget.setPointerCapture(event.pointerId);
              onSelect(object.id);
              dragRef.current = {
                kind: 'move',
                id: object.id,
                startX: event.clientX,
                startY: event.clientY,
                origin: object.rect,
              };
              setDraggingId(object.id);
            }}
          >
            <div
              className="pointer-events-none relative h-full w-full overflow-hidden"
              style={{
                transformOrigin: 'center center',
                transform: object.rotation ? `rotate(${object.rotation}deg)` : undefined,
              }}
            >
              <img
                src={object.imageSrc}
                alt=""
                draggable={false}
                className={[
                  'pointer-events-none h-full w-full select-none object-fill',
                  selected ? 'ring-2 ring-folio-500' : 'ring-1 ring-slate-300',
                ].join(' ')}
                style={cropImageStyle(crop)}
              />
              {showCropHandles && (
                <div
                  className="absolute border-2 border-dashed border-amber-400"
                  style={cropFrameStyle(crop)}
                />
              )}
              {object.caption?.trim() && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-black/55 px-1 py-0.5 text-center text-[9px] leading-tight text-white">
                  {object.caption}
                </div>
              )}
            </div>
            {selected &&
              FRAME_HANDLES.map((handle) => (
                <span
                  key={handle}
                  data-layout-handle=""
                  data-frame-handle=""
                  className={[HANDLE_CLASS, 'bg-folio-600'].join(' ')}
                  style={handleStyle(handle)}
                  onPointerDown={(event) => {
                    if (event.button !== 0) return;
                    event.preventDefault();
                    event.stopPropagation();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    onSelect(object.id);
                    dragRef.current = {
                      kind: 'resize',
                      id: object.id,
                      handle,
                      startX: event.clientX,
                      startY: event.clientY,
                      origin: object.rect,
                    };
                    setDraggingId(object.id);
                  }}
                />
              ))}
            {showCropHandles &&
              FRAME_HANDLES.map((handle) => (
                <span
                  key={`crop-${handle}`}
                  data-layout-handle=""
                  data-crop-handle=""
                  className={[HANDLE_CLASS, 'bg-amber-500'].join(' ')}
                  style={cropHandleStyle(crop, handle)}
                  onPointerDown={(event) => {
                    if (event.button !== 0) return;
                    event.preventDefault();
                    event.stopPropagation();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    onSelect(object.id);
                    dragRef.current = {
                      kind: 'crop-resize',
                      id: object.id,
                      handle,
                      startX: event.clientX,
                      startY: event.clientY,
                      origin: crop,
                      boxWidthPx: px.width,
                      boxHeightPx: px.height,
                    };
                    setDraggingId(object.id);
                  }}
                />
              ))}
          </div>
        );
      })}
    </div>
  );
}

function cropImageStyle(crop: LayoutRect): CSSProperties {
  return {
    position: 'absolute',
    width: `${100 / crop.width}%`,
    height: `${100 / crop.height}%`,
    left: `${(-crop.x / crop.width) * 100}%`,
    top: `${(-crop.y / crop.height) * 100}%`,
    maxWidth: 'none',
  };
}

function cropFrameStyle(crop: LayoutRect): CSSProperties {
  return {
    left: `${crop.x * 100}%`,
    top: `${crop.y * 100}%`,
    width: `${crop.width * 100}%`,
    height: `${crop.height * 100}%`,
  };
}

function cropHandleStyle(crop: LayoutRect, handle: LayoutResizeHandle): CSSProperties {
  const left = (crop.x + (handle.includes('e') ? crop.width : 0)) * 100;
  const top = (crop.y + (handle.includes('s') ? crop.height : 0)) * 100;
  return { left: `${left}%`, top: `${top}%`, cursor: cropCursor(handle) };
}

function cropCursor(handle: LayoutResizeHandle): CSSProperties['cursor'] {
  switch (handle) {
    case 'nw':
      return 'nwse-resize';
    case 'ne':
      return 'nesw-resize';
    case 'sw':
      return 'nesw-resize';
    case 'se':
      return 'nwse-resize';
  }
}

function handleStyle(handle: LayoutResizeHandle): CSSProperties {
  switch (handle) {
    case 'nw':
      return { left: 0, top: 0, cursor: 'nwse-resize' };
    case 'ne':
      return { left: '100%', top: 0, cursor: 'nesw-resize' };
    case 'sw':
      return { left: 0, top: '100%', cursor: 'nesw-resize' };
    case 'se':
      return { left: '100%', top: '100%', cursor: 'nwse-resize' };
  }
}
