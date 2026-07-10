import type { SKRSContext2D } from '@napi-rs/canvas';

export const GUEST_VIEW_WATERMARK_TEXT = 'ТОЛЬКО ПРОСМОТР';
export const GUEST_VIEW_WATERMARK_ALPHA = 0.15;

const WATERMARK_ROWS = 5;
const WATERMARK_COLS = 3;
const WATERMARK_ANGLE_DEG = -28;

export function drawGuestViewWatermark(
  context: SKRSContext2D,
  width: number,
  height: number,
): void {
  if (width <= 0 || height <= 0) return;

  const fontSize = Math.max(20, Math.round(width * 0.032));
  const stepX = width * 0.38;
  const stepY = height * 0.14;
  const startX = -((WATERMARK_COLS - 1) * stepX) / 2;
  const startY = -((WATERMARK_ROWS - 1) * stepY) / 2;

  context.save();
  context.globalAlpha = GUEST_VIEW_WATERMARK_ALPHA;
  context.fillStyle = '#94a3b8';
  context.font = `500 ${fontSize}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.translate(width / 2, height / 2);
  context.rotate((WATERMARK_ANGLE_DEG * Math.PI) / 180);

  for (let row = 0; row < WATERMARK_ROWS; row++) {
    const offsetX = row % 2 === 0 ? 0 : stepX * 0.2;
    for (let col = 0; col < WATERMARK_COLS; col++) {
      context.fillText(
        GUEST_VIEW_WATERMARK_TEXT,
        startX + col * stepX + offsetX,
        startY + row * stepY,
      );
    }
  }

  context.restore();
}
