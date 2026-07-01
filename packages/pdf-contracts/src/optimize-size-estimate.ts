import type { OptimizePreset } from './optimize-preset.js';

export type OptimizeSizeEstimate = {
  sourceBytes: number;
  minBytes: number;
  maxBytes: number;
  likelyTextOnly: boolean;
};

const RATIO_BY_PRESET: Record<
  OptimizePreset,
  { min: number; max: number; textMin: number; textMax: number }
> = {
  none: { min: 1, max: 1, textMin: 1, textMax: 1 },
  print: { min: 0.92, max: 1, textMin: 0.95, textMax: 1 },
  archive: { min: 0.35, max: 0.75, textMin: 0.9, textMax: 1 },
  email: { min: 0.2, max: 0.55, textMin: 0.88, textMax: 1 },
};

/** ~80 КБ на страницу — эвристика «в основном текст». */
const TEXT_ONLY_BYTES_PER_PAGE = 80_000;

export function estimateOptimizeSize(
  sourceBytes: number,
  pageCount: number,
  preset: OptimizePreset,
): OptimizeSizeEstimate | null {
  if (!Number.isFinite(sourceBytes) || sourceBytes <= 0) return null;

  const likelyTextOnly =
    pageCount > 0 && sourceBytes / pageCount < TEXT_ONLY_BYTES_PER_PAGE;
  const ratio = RATIO_BY_PRESET[preset];
  const minRatio = likelyTextOnly ? ratio.textMin : ratio.min;
  const maxRatio = likelyTextOnly ? ratio.textMax : ratio.max;

  return {
    sourceBytes,
    minBytes: Math.max(1, Math.floor(sourceBytes * minRatio)),
    maxBytes: Math.max(1, Math.ceil(sourceBytes * maxRatio)),
    likelyTextOnly,
  };
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

export function formatOptimizeSizeRange(estimate: OptimizeSizeEstimate): string {
  if (estimate.minBytes === estimate.maxBytes) {
    return formatFileSize(estimate.minBytes);
  }
  return `${formatFileSize(estimate.minBytes)}–${formatFileSize(estimate.maxBytes)}`;
}
