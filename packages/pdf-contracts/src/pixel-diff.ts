export type RgbaPageBitmap = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

export type PagePixelDiffResult = {
  page: number;
  diffRatio: number;
  drifted: boolean;
};

const DEFAULT_COLOR_THRESHOLD = 24;
const DEFAULT_DRIFT_RATIO = 0.018;

function colorDistance(a: Uint8ClampedArray, b: Uint8ClampedArray, offset: number): number {
  return (
    Math.abs(a[offset]! - b[offset]!) +
    Math.abs(a[offset + 1]! - b[offset + 1]!) +
    Math.abs(a[offset + 2]! - b[offset + 2]!)
  );
}

export function computePixelDiffRatio(
  source: RgbaPageBitmap,
  target: RgbaPageBitmap,
  options?: { colorThreshold?: number },
): number {
  if (source.width !== target.width || source.height !== target.height) {
    return 1;
  }
  const pixelCount = source.width * source.height;
  if (pixelCount === 0) return 0;
  const threshold = options?.colorThreshold ?? DEFAULT_COLOR_THRESHOLD;
  let diffPixels = 0;
  for (let i = 0; i < pixelCount; i++) {
    const offset = i * 4;
    if (colorDistance(source.data, target.data, offset) > threshold) {
      diffPixels++;
    }
  }
  return diffPixels / pixelCount;
}

export function comparePagePixelDiffs(
  pages: Array<{ page: number; source: RgbaPageBitmap; target: RgbaPageBitmap }>,
  options?: { driftRatio?: number; colorThreshold?: number },
): PagePixelDiffResult[] {
  const driftRatio = options?.driftRatio ?? DEFAULT_DRIFT_RATIO;
  return pages.map(({ page, source, target }) => {
    const diffRatio = computePixelDiffRatio(source, target, options);
    return {
      page,
      diffRatio,
      drifted: diffRatio >= driftRatio,
    };
  });
}

export function summarizePixelDrift(results: PagePixelDiffResult[]): {
  pixelPagesChecked: number;
  pixelDriftPages: number;
  pixelDriftRatio: number;
  visualDriftPages: number[];
} {
  const checked = results.length;
  const drifted = results.filter((r) => r.drifted);
  return {
    pixelPagesChecked: checked,
    pixelDriftPages: drifted.length,
    pixelDriftRatio: checked > 0 ? drifted.length / checked : 0,
    visualDriftPages: drifted.map((r) => r.page).sort((a, b) => a - b),
  };
}
