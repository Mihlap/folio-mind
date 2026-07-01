import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  clampLayoutRect,
  layoutRectToPx,
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
    };

type Props = {
  pageNumber: number;
  pageWidthPx: number;
  pageHeightPx: number;
  objects: LayoutImageObject[];
  selectedId: string | null;
  snapStep: number;
  onSelect: (id: string | null) => void;
  onObjectChange: (id: string, rect: LayoutRect) => void;
};

export function PdfLayoutObjectsOverlay({
  pageNumber,
  pageWidthPx,
  pageHeightPx,
  objects,
  selectedId,
  snapStep,
  onSelect,
  onObjectChange,
}: Props) {
  const dragRef = useRef<DragState | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const pageObjects = objects.filter((o) => o.page === pageNumber);

  const finishPointer = useCallback(() => {
    dragRef.current = null;
    setDraggingId(null);
  }, []);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || pageWidthPx <= 0 || pageHeightPx <= 0) return;
      const dxPx = event.clientX - drag.startX;
      const dyPx = event.clientY - drag.startY;
      const dxFrac = dxPx / pageWidthPx;
      const dyFrac = dyPx / pageHeightPx;

      let next: LayoutRect;
      if (drag.kind === 'move') {
        next = clampLayoutRect({
          ...drag.origin,
          x: drag.origin.x + dxFrac,
          y: drag.origin.y + dyFrac,
        });
      } else {
        next = resizeLayoutRect(drag.origin, drag.handle, dxFrac, dyFrac);
        next = clampLayoutRect(next);
      }
      if (snapStep > 0) next = snapLayoutRect(next, snapStep);
      onObjectChange(drag.id, next);
      dragRef.current = {
        ...drag,
        origin: next,
        startX: event.clientX,
        startY: event.clientY,
      };
    };
    const onUp = () => finishPointer();
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [finishPointer, onObjectChange, pageHeightPx, pageWidthPx, snapStep]);

  if (pageObjects.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[20]" aria-label="Объекты макета">
      {pageObjects.map((object) => {
        const px = layoutRectToPx(object.rect, pageWidthPx, pageHeightPx);
        const selected = object.id === selectedId;
        return (
          <div
            key={object.id}
            className={[
              'pointer-events-auto absolute touch-none',
              draggingId === object.id ? 'z-30' : 'z-20',
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
              className="h-full w-full"
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
                  'h-full w-full object-cover select-none',
                  selected ? 'ring-2 ring-folio-500' : 'ring-1 ring-slate-300',
                ].join(' ')}
              />
            </div>
            {selected &&
              (['nw', 'ne', 'sw', 'se'] as const).map((handle) => (
                <span
                  key={handle}
                  className="pointer-events-auto absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-folio-600 shadow"
                  style={handleStyle(handle)}
                  onPointerDown={(event) => {
                    if (event.button !== 0) return;
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
          </div>
        );
      })}
    </div>
  );
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
