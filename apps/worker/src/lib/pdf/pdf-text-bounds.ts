export type PdfTextBoundsItem = {
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  ascent?: number;
  descent?: number;
  fontAscent?: number;
  fontDescent?: number;
  fontBoundingBoxAscent?: number;
  fontBoundingBoxDescent?: number;
};

export type PdfTextBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const DEFAULT_ASCENT_RATIO = 0.8;
const DEFAULT_DESCENT_RATIO = 0.2;
const MIN_BOX_HEIGHT = 1;

function positive(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function ratioValue(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  if (value > 0 && value <= 1.5) return value;
  return fallback;
}

function resolveAscent(item: PdfTextBoundsItem, fontSize: number): number {
  const ratio = ratioValue(item.ascent, DEFAULT_ASCENT_RATIO);
  const bounding = positive(item.fontBoundingBoxAscent);
  if (bounding) return bounding;
  const ascent = positive(item.fontAscent);
  if (ascent) return ascent > 1.5 ? ascent : ascent * fontSize;
  return fontSize * ratio;
}

function resolveDescent(item: PdfTextBoundsItem, fontSize: number): number {
  const rawRatio = typeof item.descent === 'number' && Number.isFinite(item.descent) ? item.descent : -DEFAULT_DESCENT_RATIO;
  const ratio = rawRatio < 0 && rawRatio >= -1.5 ? rawRatio : -DEFAULT_DESCENT_RATIO;
  const bounding = positive(item.fontBoundingBoxDescent);
  if (bounding) return -bounding;
  const descent = positive(item.fontDescent);
  if (descent) return descent > 1.5 ? -descent : -descent * fontSize;
  return fontSize * ratio;
}

export function textItemBox(item: PdfTextBoundsItem): PdfTextBox {
  const fontSize = positive(item.fontSize) ?? positive(item.height) ?? 12;
  const ascent = resolveAscent(item, fontSize);
  const descent = resolveDescent(item, fontSize);
  const top = item.y + ascent;
  const bottom = item.y + descent;
  const height = Math.max(Math.abs(top - bottom), Math.min(fontSize, MIN_BOX_HEIGHT));
  return {
    x: item.x,
    y: Math.min(top, bottom),
    width: Math.max(item.width, 0),
    height,
  };
}

export function textSubstringBox(
  item: PdfTextBoundsItem,
  startIndex: number,
  length: number,
  measuredLength: number,
): PdfTextBox {
  const base = textItemBox(item);
  const charCount = Math.max(measuredLength, 1);
  const charWidth = item.width > 0 ? item.width / charCount : 0;
  const safeStart = Math.max(0, Math.min(startIndex, charCount));
  const safeLength = Math.max(0, Math.min(length, charCount - safeStart));
  return {
    x: item.x + safeStart * charWidth,
    y: base.y,
    width: safeLength * charWidth,
    height: base.height,
  };
}

export function unionTextBoxes(a: PdfTextBox, b: PdfTextBox): PdfTextBox {
  const x1 = Math.min(a.x, b.x);
  const y1 = Math.min(a.y, b.y);
  const x2 = Math.max(a.x + a.width, b.x + b.width);
  const y2 = Math.max(a.y + a.height, b.y + b.height);
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

function isFiniteBox(box: PdfTextBox): boolean {
  return (
    Number.isFinite(box.x) &&
    Number.isFinite(box.y) &&
    Number.isFinite(box.width) &&
    Number.isFinite(box.height) &&
    box.width > 0 &&
    box.height > 0
  );
}

export function clampBoxToNeighborLines(
  box: PdfTextBox,
  baselineY: number,
  pageBaselines: number[],
  fallbackHalfGap: number,
): PdfTextBox {
  if (!isFiniteBox(box)) return box;
  const baselines = [...new Set(pageBaselines.filter((value) => Number.isFinite(value)))].sort((a, b) => b - a);
  const index = baselines.reduce(
    (best, value, current) =>
      Math.abs(value - baselineY) < Math.abs(baselines[best]! - baselineY) ? current : best,
    0,
  );
  const previous = baselines[index - 1];
  const next = baselines[index + 1];
  const topLimit = previous != null ? (baselineY + previous) / 2 : box.y + box.height;
  const bottomLimit = next != null ? (baselineY + next) / 2 : box.y;
  const y = Math.max(box.y, bottomLimit);
  const top = Math.min(box.y + box.height, topLimit);
  if (top - y > 0.01) {
    return { x: box.x, y, width: box.width, height: top - y };
  }
  const height = Math.max(Math.min(box.height, fallbackHalfGap), 0.5);
  return { x: box.x, y: baselineY - height * 0.2, width: box.width, height };
}
