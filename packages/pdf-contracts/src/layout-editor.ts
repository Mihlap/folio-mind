/** Доля листа (0..1) — не зависит от zoom в viewer. */
export type LayoutRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type LayoutImageObject = {
  kind?: 'image';
  id: string;
  page: number;
  rect: LayoutRect;
  /** data: URL изображения (сессия / черновик). */
  imageSrc: string;
  rotation: number;
  /** Доля исходного изображения (0..1), видимая в рамке на листе. */
  crop?: LayoutRect;
  /** Имя исходного файла (для автоподписи). */
  sourceFileName?: string;
  /** Подпись под изображением (печатается при сохранении макета). */
  caption?: string;
};

export type LayoutFill =
  | { type: 'solid'; color: string; opacity?: number }
  | { type: 'linear'; angleDeg: number; stops: { offset: number; color: string }[]; opacity?: number };

export type LayoutShapeObject = {
  kind: 'shape';
  id: string;
  page: number;
  rect: LayoutRect;
  rotation?: number;
  fill: LayoutFill;
};

export type LayoutPageObject = LayoutImageObject | LayoutShapeObject;

export function isLayoutImageObject(object: LayoutPageObject): object is LayoutImageObject {
  return object.kind !== 'shape';
}

export function isLayoutShapeObject(object: LayoutPageObject): object is LayoutShapeObject {
  return object.kind === 'shape';
}

export const DEFAULT_LAYOUT_SOLID_FILL: LayoutFill = {
  type: 'solid',
  color: '#e2e8f0',
};

export const DEFAULT_LAYOUT_GRADIENT_FILL: LayoutFill = {
  type: 'linear',
  angleDeg: 135,
  stops: [
    { offset: 0, color: '#f8fafc' },
    { offset: 1, color: '#94a3b8' },
  ],
};

export const PDF_POINT_TO_MM = 25.4 / 72;

export function pdfPointsToMm(points: number): number {
  return points * PDF_POINT_TO_MM;
}

export function clampLayoutRect(rect: LayoutRect, minSize = 0.04): LayoutRect {
  const width = Math.max(minSize, Math.min(1, rect.width));
  const height = Math.max(minSize, Math.min(1, rect.height));
  const x = Math.max(0, Math.min(1 - width, rect.x));
  const y = Math.max(0, Math.min(1 - height, rect.y));
  return { x, y, width, height };
}

export function snapLayoutValue(value: number, step: number): number {
  if (step <= 0) return value;
  return Math.round(value / step) * step;
}

export function snapLayoutRect(rect: LayoutRect, step: number, minSize = 0.04): LayoutRect {
  if (step <= 0) return clampLayoutRect(rect, minSize);
  const snapped = {
    x: snapLayoutValue(rect.x, step),
    y: snapLayoutValue(rect.y, step),
    width: snapLayoutValue(rect.width, step),
    height: snapLayoutValue(rect.height, step),
  };
  return clampLayoutRect(snapped, minSize);
}

export function layoutStepFraction(gridStepMm: number, pageSizeMm: number): number {
  if (pageSizeMm <= 0 || gridStepMm <= 0) return 0;
  return gridStepMm / pageSizeMm;
}

export function layoutRectToPx(
  rect: LayoutRect,
  pageWidthPx: number,
  pageHeightPx: number,
): { left: number; top: number; width: number; height: number } {
  return {
    left: rect.x * pageWidthPx,
    top: rect.y * pageHeightPx,
    width: rect.width * pageWidthPx,
    height: rect.height * pageHeightPx,
  };
}

export function pxDeltaToLayoutRect(
  rect: LayoutRect,
  dxPx: number,
  dyPx: number,
  pageWidthPx: number,
  pageHeightPx: number,
): LayoutRect {
  if (pageWidthPx <= 0 || pageHeightPx <= 0) return rect;
  return clampLayoutRect({
    ...rect,
    x: rect.x + dxPx / pageWidthPx,
    y: rect.y + dyPx / pageHeightPx,
  });
}

export type LayoutImageDrawParams = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDeg: number;
};

/** PDF-координаты: поворот вокруг центра рамки (как в CSS transform-origin: center). */
export function computeLayoutImageDrawParams(
  rect: LayoutRect,
  pageWidth: number,
  pageHeight: number,
  rotationDeg: number,
): LayoutImageDrawParams {
  const width = rect.width * pageWidth;
  const height = rect.height * pageHeight;
  const centerX = rect.x * pageWidth + width / 2;
  const centerYFromBottom = pageHeight - (rect.y * pageHeight + height / 2);

  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const localX = -width / 2;
  const localY = -height / 2;

  return {
    x: centerX + localX * cos - localY * sin,
    y: centerYFromBottom + localX * sin + localY * cos,
    width,
    height,
    rotationDeg,
  };
}

export function normalizeLayoutRotation(rotationDeg: number): number {
  return ((rotationDeg % 360) + 360) % 360;
}

export function rotateLayoutObject(object: LayoutImageObject, deltaDeg: number): LayoutImageObject {
  return {
    ...object,
    rotation: normalizeLayoutRotation((object.rotation ?? 0) + deltaDeg),
  };
}

export function rotateLayoutPageObject(object: LayoutPageObject, deltaDeg: number): LayoutPageObject {
  if (isLayoutShapeObject(object)) {
    return {
      ...object,
      rotation: normalizeLayoutRotation((object.rotation ?? 0) + deltaDeg),
    };
  }
  return rotateLayoutObject(object, deltaDeg);
}

export function layoutFillToCss(fill: LayoutFill): string {
  const alpha = fill.opacity != null && fill.opacity < 1 ? fill.opacity : undefined;
  if (fill.type === 'solid') {
    if (alpha != null && /^#[0-9a-f]{6}$/i.test(fill.color)) {
      const r = parseInt(fill.color.slice(1, 3), 16);
      const g = parseInt(fill.color.slice(3, 5), 16);
      const b = parseInt(fill.color.slice(5, 7), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    return fill.color;
  }
  const stops = fill.stops
    .map((stop) => `${stop.color} ${Math.round(stop.offset * 100)}%`)
    .join(', ');
  const gradient = `linear-gradient(${fill.angleDeg}deg, ${stops})`;
  if (alpha != null) {
    return `linear-gradient(${fill.angleDeg}deg, rgba(0,0,0,${alpha}), rgba(0,0,0,${alpha})), ${gradient}`;
  }
  return gradient;
}
