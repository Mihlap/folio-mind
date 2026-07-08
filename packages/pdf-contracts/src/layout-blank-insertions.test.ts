import { describe, expect, it } from 'vitest';
import {
  mergeBlankInsertion,
  sourceAfterFromDisplayAfter,
  templatePageSpan,
} from './layout-blank-insertions.js';

describe('layout-blank-insertions', () => {
  it('templatePageSpan uses max template page', () => {
    expect(templatePageSpan([{ page: 1 }, { page: 2 }])).toBe(2);
    expect(templatePageSpan([])).toBe(1);
  });

  it('sourceAfterFromDisplayAfter without prior insertions', () => {
    expect(sourceAfterFromDisplayAfter(2, 5, [])).toBe(2);
    expect(sourceAfterFromDisplayAfter(5, 5, [])).toBe(5);
  });

  it('sourceAfterFromDisplayAfter maps display pages after one insertion', () => {
    const insertions = [{ afterPage: 2, count: 1 }];
    expect(sourceAfterFromDisplayAfter(2, 5, insertions)).toBe(2);
    expect(sourceAfterFromDisplayAfter(3, 5, insertions)).toBe(2);
    expect(sourceAfterFromDisplayAfter(4, 5, insertions)).toBe(3);
  });

  it('mergeBlankInsertion accumulates at same anchor', () => {
    const first = mergeBlankInsertion([], 2, 1);
    const second = mergeBlankInsertion(first, 2, 1);
    expect(second).toEqual([{ afterPage: 2, count: 2 }]);
  });
});
