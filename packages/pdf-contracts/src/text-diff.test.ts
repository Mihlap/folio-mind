import { describe, expect, it } from 'vitest';
import { parseExtractedTextJson } from './extracted-text.js';
import { compareVersionTexts, diffPageLines, arePageTextsEquivalent } from './text-diff.js';
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
  it('ignores word order noise from PDF text extraction', () => {
    const result = compareVersionTexts(
      [{ page: 1, text: 'Договор между сторонами' }],
      [{ page: 1, text: 'сторонами между Договор' }],
    );
    expect(result.summary.unchangedPages).toBe(1);
    expect(result.pages[0]?.status).toBe('unchanged');
  });
  it('ignores whitespace-only differences', () => {
    expect(arePageTextsEquivalent('ст. 1.1  ст. 1.2', 'ст. 1.1 ст. 1.2')).toBe(true);
  });
  it('detects substantive word change on a page', () => {
    const result = compareVersionTexts(
      [{ page: 1, text: 'Договор № _________' }],
      [{ page: 1, text: 'Договор № 1777' }],
    );
    expect(result.summary.modifiedPages).toBe(1);
  });
  it('leaves other pages unchanged when only one page differs', () => {
    const result = compareVersionTexts(
      [
        { page: 1, text: 'Заголовок договора' },
        { page: 2, text: 'Раздел один текст' },
        { page: 3, text: 'Раздел два текст' },
      ],
      [
        { page: 1, text: 'Заголовок договора 1777' },
        { page: 2, text: 'текст Раздел один' },
        { page: 3, text: 'текст два Раздел' },
      ],
      { editedPages: new Set([1]) },
    );
    expect(result.summary.modifiedPages).toBe(1);
    expect(result.pages.find((p) => p.page === 1)?.status).toBe('modified');
    expect(result.pages.find((p) => p.page === 2)?.status).toBe('unchanged');
    expect(result.pages.find((p) => p.page === 3)?.status).toBe('unchanged');
  });
  it('treats pdf resave noise on non-edited pages as unchanged', () => {
    const shared =
      'Договор купли-продажи между Покупателем и Продавцом о передаче имущества на условиях настоящего соглашения';
    const result = compareVersionTexts(
      [
        { page: 1, text: `${shared} № _________` },
        { page: 2, text: shared },
        { page: 3, text: shared },
      ],
      [
        { page: 1, text: `${shared} № 1777` },
        { page: 2, text: shared.replace(/ /g, '  ') },
        { page: 3, text: [...shared.split(' ')].reverse().join(' ') },
      ],
      { editedPages: new Set([1]) },
    );
    expect(result.summary.modifiedPages).toBe(1);
    expect(result.pages.find((p) => p.page === 2)?.status).toBe('unchanged');
    expect(result.pages.find((p) => p.page === 3)?.status).toBe('unchanged');
  });
});
describe('diffPageLines', () => {
  it('returns equal lines for identical text', () => {
    const lines = diffPageLines('строка', 'строка');
    expect(lines.every((l) => l.type === 'equal')).toBe(true);
  });
});
