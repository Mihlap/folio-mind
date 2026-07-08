import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  clampLayoutRect,
  layoutFillToCss,
  layoutRectToPx,
  snapLayoutRect,
  type LayoutRect,
  type LayoutShapeObject,
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
  shapes: LayoutShapeObject[];
  selectedId: string | null;
  snapStep: number;
  onSelect: (id: string | null) => void;
  onShapeChange: (id: string, rect: LayoutRect) => void;
};

const FRAME_HANDLES = ['nw', 'ne', 'sw', 'se'] as const;
const HANDLE_CLASS =
  'pointer-events-auto absolute z-50 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-slate-600 shadow-md';

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

export function PdfLayoutShapesOverlay({
  pageNumber,
  pageWidthPx,
  pageHeightPx,
  shapes,
  selectedId,
  snapStep,
  onSelect,
  onShapeChange,
}: Props) {
  const dragRef = useRef<DragState | null>(null);
  const onShapeChangeRef = useRef(onShapeChange);
  const snapStepRef = useRef(snapStep);
  const pageSizeRef = useRef({ pageWidthPx, pageHeightPx });
  const [draggingId, setDraggingId] = useState<string | null>(null);

  onShapeChangeRef.current = onShapeChange;
  snapStepRef.current = snapStep;
  pageSizeRef.current = { pageWidthPx, pageHeightPx };

  const pageShapes = shapes.filter((shape) => Number(shape.page) === pageNumber);

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
      onShapeChangeRef.current(drag.id, rectFromDrag(drag, event, w, h));
    };

    const onUp = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const { pageWidthPx: w, pageHeightPx: h } = pageSizeRef.current;
      const step = snapStepRef.current;
      if (step > 0 && w > 0 && h > 0) {
        onShapeChangeRef.current(
          drag.id,
          snapLayoutRect(rectFromDrag(drag, event, w, h), step),
        );
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

  if (pageShapes.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[18]" aria-label="Подложки макета">
      {pageShapes.map((shape) => {
        const px = layoutRectToPx(shape.rect, pageWidthPx, pageHeightPx);
        const selected = shape.id === selectedId;
        return (
          <div
            key={shape.id}
            className={[
              'pointer-events-auto absolute touch-none',
              draggingId === shape.id ? 'z-28' : 'z-18',
              selected ? 'cursor-move' : 'cursor-pointer',
            ].join(' ')}
            data-layout-shape=""
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
              onSelect(shape.id);
              dragRef.current = {
                kind: 'move',
                id: shape.id,
                startX: event.clientX,
                startY: event.clientY,
                origin: shape.rect,
              };
              setDraggingId(shape.id);
            }}
          >
            <div
              className="pointer-events-none h-full w-full"
              style={{
                background: layoutFillToCss(shape.fill),
                transformOrigin: 'center center',
                transform: shape.rotation ? `rotate(${shape.rotation}deg)` : undefined,
                boxShadow: selected ? 'inset 0 0 0 2px #0f766e' : 'inset 0 0 0 1px rgba(15,23,42,0.15)',
              }}
            />
            {selected &&
              FRAME_HANDLES.map((handle) => (
                <span
                  key={handle}
                  data-layout-handle=""
                  className={HANDLE_CLASS}
                  style={handleStyle(handle)}
                  onPointerDown={(event) => {
                    if (event.button !== 0) return;
                    event.preventDefault();
                    event.stopPropagation();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    onSelect(shape.id);
                    dragRef.current = {
                      kind: 'resize',
                      id: shape.id,
                      handle,
                      startX: event.clientX,
                      startY: event.clientY,
                      origin: shape.rect,
                    };
                    setDraggingId(shape.id);
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
