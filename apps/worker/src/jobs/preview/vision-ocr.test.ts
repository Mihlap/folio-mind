import { describe, expect, it } from 'vitest';
import { buildOcrBatches } from './vision-ocr.js';

describe('buildOcrBatches', () => {
  it('splits pages into consecutive batches', () => {
    expect(buildOcrBatches(25, 10)).toEqual([
      [1, 10],
      [11, 20],
      [21, 25],
    ]);
  });

  it('returns a single batch when pages fit the batch size', () => {
    expect(buildOcrBatches(10, 10)).toEqual([[1, 10]]);
  });

  it('returns nothing for zero or negative pages', () => {
    expect(buildOcrBatches(0, 10)).toEqual([]);
    expect(buildOcrBatches(-5, 10)).toEqual([]);
  });

  it('never skips or repeats a page', () => {
    const batches = buildOcrBatches(97, 10);
    const pages = batches.flatMap(([from, to]) =>
      Array.from({ length: to - from + 1 }, (_, i) => from + i),
    );
    expect(pages[0]).toBe(1);
    expect(pages[pages.length - 1]).toBe(97);
    expect(pages).toEqual(Array.from({ length: 97 }, (_, i) => i + 1));
  });

  it('guards against a zero batch size', () => {
    expect(buildOcrBatches(3, 0)).toEqual([
      [1, 1],
      [2, 2],
      [3, 3],
    ]);
  });
});
