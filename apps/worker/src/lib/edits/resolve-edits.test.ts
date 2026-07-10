import { describe, expect, it } from 'vitest';
import { resolveEditsForDocx, resolveEditsForPdfOverlay } from './resolve-edits.js';

describe('resolveEditsForPdfOverlay', () => {
  it('strips markdown for pdf text overlay', () => {
    const [edit] = resolveEditsForPdfOverlay([
      {
        originalText: 'старый',
        suggestion: '- **новый** текст',
        contentFormat: 'markdown',
        page: 1,
      },
    ]);
    expect(edit?.suggestion).toBe('• новый текст');
  });
});

describe('resolveEditsForDocx', () => {
  it('provides plain and optional runs for markdown', () => {
    const [edit] = resolveEditsForDocx([
      {
        originalText: 'было',
        suggestion: '**стало**',
        contentFormat: 'markdown',
        page: 2,
      },
    ]);
    expect(edit?.suggestionPlain).toBe('стало');
    expect(edit?.suggestionRunsXml).toContain('<w:b/>');
  });

  it('keeps multiline list plain for docx', () => {
    const [edit] = resolveEditsForDocx([
      {
        originalText: 'было',
        suggestion: '- первый\n- второй',
        contentFormat: 'markdown',
        page: 1,
      },
    ]);
    expect(edit?.suggestionPlain).toBe('• первый\n• второй');
    expect(edit?.suggestionRunsXml).toContain('<w:br/>');
  });
});
