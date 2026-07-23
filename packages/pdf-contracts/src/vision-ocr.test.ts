import { describe, expect, it } from 'vitest';
import { needsVisionOcr } from './vision-ocr.js';

describe('needsVisionOcr', () => {
  it('returns true for empty text with pages', () => {
    expect(needsVisionOcr({ text: '', pages: [], pageCount: 5 })).toBe(true);
  });

  it('returns false for dense text layer', () => {
    const text = 'а'.repeat(5000);
    expect(
      needsVisionOcr({
        text,
        pages: [{ page: 1, text }],
        pageCount: 2,
      }),
    ).toBe(false);
  });

  it('returns true when avg chars per page is low', () => {
    expect(
      needsVisionOcr({
        text: 'коротко',
        pages: [{ page: 1, text: 'коротко' }],
        pageCount: 10,
      }),
    ).toBe(true);
  });

  it('returns false when pageCount unknown but text is substantial', () => {
    const text = 'а'.repeat(200);
    expect(needsVisionOcr({ text, pages: [{ page: 1, text }], pageCount: 0 })).toBe(false);
  });
});
