import { describe, expect, it } from 'vitest';
import {
  comparePagePixelDiffs,
  computePixelDiffRatio,
  summarizePixelDrift,
  type RgbaPageBitmap,
} from './pixel-diff.js';

function solidBitmap(width: number, height: number, r: number, g: number, b: number): RgbaPageBitmap {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    data[o] = r;
    data[o + 1] = g;
    data[o + 2] = b;
    data[o + 3] = 255;
  }
  return { width, height, data };
}

describe('computePixelDiffRatio', () => {
  it('returns 0 for identical bitmaps', () => {
    const a = solidBitmap(4, 4, 240, 240, 240);
    expect(computePixelDiffRatio(a, a)).toBe(0);
  });

  it('returns 1 for different dimensions', () => {
    const a = solidBitmap(4, 4, 0, 0, 0);
    const b = solidBitmap(5, 4, 0, 0, 0);
    expect(computePixelDiffRatio(a, b)).toBe(1);
  });

  it('detects partial drift', () => {
    const source = solidBitmap(10, 10, 255, 255, 255);
    const target = solidBitmap(10, 10, 255, 255, 255);
    for (let i = 0; i < 10; i++) {
      const o = i * 4;
      target.data[o] = 0;
      target.data[o + 1] = 0;
      target.data[o + 2] = 0;
    }
    const ratio = computePixelDiffRatio(source, target);
    expect(ratio).toBeGreaterThan(0);
    expect(ratio).toBeLessThan(0.2);
  });
});

describe('summarizePixelDrift', () => {
  it('aggregates drift pages', () => {
    const results = comparePagePixelDiffs([
      {
        page: 1,
        source: solidBitmap(8, 8, 255, 255, 255),
        target: solidBitmap(8, 8, 255, 255, 255),
      },
      {
        page: 2,
        source: solidBitmap(8, 8, 255, 255, 255),
        target: solidBitmap(8, 8, 0, 0, 0),
      },
    ]);
    const summary = summarizePixelDrift(results);
    expect(summary.pixelPagesChecked).toBe(2);
    expect(summary.pixelDriftPages).toBe(1);
    expect(summary.visualDriftPages).toEqual([2]);
  });
});
