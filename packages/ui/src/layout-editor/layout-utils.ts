import type { LayoutRect } from '@folio-mind/pdf-contracts';

export type LayoutResizeHandle = 'nw' | 'ne' | 'sw' | 'se';

export function getLayoutRulerOffset(): number {
  return 20;
}

export function resizeLayoutRect(
  rect: LayoutRect,
  handle: LayoutResizeHandle,
  dxFrac: number,
  dyFrac: number,
): LayoutRect {
  let { x, y, width, height } = rect;
  if (handle === 'se') {
    width += dxFrac;
    height += dyFrac;
  } else if (handle === 'sw') {
    x += dxFrac;
    width -= dxFrac;
    height += dyFrac;
  } else if (handle === 'ne') {
    y += dyFrac;
    width += dxFrac;
    height -= dyFrac;
  } else if (handle === 'nw') {
    x += dxFrac;
    y += dyFrac;
    width -= dxFrac;
    height -= dyFrac;
  }
  return { x, y, width, height };
}
