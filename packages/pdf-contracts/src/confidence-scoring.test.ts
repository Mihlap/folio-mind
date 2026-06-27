import { describe, expect, it } from 'vitest';
import { scoreApplyEditsConfidence } from './confidence-scoring.js';

describe('scoreApplyEditsConfidence', () => {
  it('docx path uses reflow scoring instead of page-by-page drift', () => {
    const pages = [
      { page: 1, text: 'Smoke page 1/3' },
      { page: 2, text: 'Smoke page 2/3' },
      { page: 3, text: 'Smoke page 3/3' },
    ];
    const result = scoreApplyEditsConfidence({
      sourcePageCount: 3,
      targetPageCount: 3,
      sourcePages: pages,
      targetPages: [
        { page: 1, text: 'Updated smoke page 1' },
        { page: 2, text: 'Smoke page 2/3' },
        { page: 3, text: 'Smoke page 3/3' },
      ],
      editedPages: [1],
      method: 'docx',
    });
    expect(result.level).toBe('yellow');
    expect(result.unchangedPagesDrifted).toBe(0);
    expect(result.summary).toContain('Word');
  });

  it('yellow when page count differs by 1', () => {
    const result = scoreApplyEditsConfidence({
      sourcePageCount: 3,
      targetPageCount: 4,
      sourcePages: [{ page: 1, text: 'A' }],
      targetPages: [{ page: 1, text: 'A' }],
      editedPages: [1],
      method: 'docx-converted',
    });
    expect(result.level).toBe('yellow');
    expect(result.pageCountDelta).toBe(1);
  });

  it('red when many unchanged pages drift (overlay path)', () => {
    const result = scoreApplyEditsConfidence({
      sourcePageCount: 5,
      targetPageCount: 5,
      sourcePages: [
        { page: 1, text: 'One' },
        { page: 2, text: 'Two' },
        { page: 3, text: 'Three' },
        { page: 4, text: 'Four' },
      ],
      targetPages: [
        { page: 1, text: 'One edited' },
        { page: 2, text: 'Two changed' },
        { page: 3, text: 'Three changed' },
        { page: 4, text: 'Four' },
      ],
      editedPages: [1],
      method: 'pdf-overlay',
    });
    expect(result.level).toBe('red');
    expect(result.unchangedPagesDrifted).toBeGreaterThan(1);
  });
});
