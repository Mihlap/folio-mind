import { describe, expect, it } from 'vitest';
import {
  buildPageLayoutSignature,
  comparePageLayoutSignatures,
} from './layout-confidence.js';

describe('layout-confidence', () => {
  it('detects unchanged layout', () => {
    const items = [
      { x: 50, y: 800 },
      { x: 50, y: 780 },
    ];
    const sig = buildPageLayoutSignature(1, items);
    const result = comparePageLayoutSignatures({
      source: [sig],
      target: [buildPageLayoutSignature(1, items)],
      editedPages: [],
    });
    expect(result.layoutDriftPages).toBe(0);
  });

  it('skips edited pages', () => {
    const result = comparePageLayoutSignatures({
      source: [buildPageLayoutSignature(1, [{ x: 1, y: 2 }])],
      target: [buildPageLayoutSignature(1, [{ x: 99, y: 99 }])],
      editedPages: [1],
    });
    expect(result.layoutPagesChecked).toBe(0);
  });
});
