import { describe, expect, it } from 'vitest';
import { parseExtractedTextJson } from './extracted-text.js';
import { compareVersionTexts, diffPageLines } from './text-diff.js';

describe('parseExtractedTextJson', () => {
  it('parses legacy text-only payload', () => {
    const result = parseExtractedTextJson(
      JSON.stringify({ text: 'Стр. 1\n\nСтр. 2', extractedAt: '2026-01-01' }),
    );
    expect(result.pages).toEqual([
      { page: 1, text: 'Стр. 1' },
      { page: 2, text: 'Стр. 2' },
    ]);
  });

  it('parses pages array', () => {
    const result = parseExtractedTextJson(
      JSON.stringify({
        text: 'a\n\nb',
        pages: [
          { page: 1, text: 'a' },
          { page: 2, text: 'b' },
        ],
      }),
    );
    expect(result.pages).toHaveLength(2);
  });
});

describe('compareVersionTexts', () => {
  it('detects modified page', () => {
    const result = compareVersionTexts(
      [{ page: 1, text: 'Договор v1' }],
      [{ page: 1, text: 'Договор v2' }],
    );
    expect(result.summary.modifiedPages).toBe(1);
    expect(result.pages[0]?.status).toBe('modified');
    expect(result.pages[0]?.lines?.some((l) => l.type === 'delete')).toBe(true);
    expect(result.pages[0]?.lines?.some((l) => l.type === 'insert')).toBe(true);
  });

  it('detects added and removed pages', () => {
    const result = compareVersionTexts(
      [
        { page: 1, text: 'A' },
        { page: 2, text: 'B' },
      ],
      [{ page: 1, text: 'A' }],
    );
    expect(result.summary.removedPages).toBe(1);
    expect(result.pages.find((p) => p.page === 2)?.status).toBe('removed');
  });
});

describe('diffPageLines', () => {
  it('returns equal lines for identical text', () => {
    const lines = diffPageLines('строка', 'строка');
    expect(lines.every((l) => l.type === 'equal')).toBe(true);
  });
});
