import { describe, expect, it } from 'vitest';
import { hasInlineMarkdownFormatting, parseInlineMarkdown, stripInlineMarkdown } from './inline.js';
import { markdownToPlainText } from './markdown-to-plain.js';
import { markdownInlineToDocxXml, plainMultilineToDocxXml } from './markdown-to-docx.js';
import { readContentFormat, readAcceptedEditContentFormat, annotationMetaWithContentFormat } from './meta.js';
import { resolveEditSuggestion } from './resolve.js';

describe('stripInlineMarkdown', () => {
  it('removes bold and math', () => {
    expect(stripInlineMarkdown('**жирный** и $E=mc^2$')).toBe('жирный и E=mc^2');
  });
});

describe('markdownToPlainText', () => {
  it('converts unordered list markers', () => {
    expect(markdownToPlainText('- первый пункт\n- второй пункт')).toBe(
      '• первый пункт\n• второй пункт',
    );
  });

  it('converts ordered list', () => {
    expect(markdownToPlainText('1. пункт один\n2. пункт два')).toBe('1. пункт один\n2. пункт два');
  });

  it('allows explicit bullet characters', () => {
    expect(markdownToPlainText('• **жирный** маркер')).toBe('• жирный маркер');
  });

  it('decodes &bullet; entity and keeps multiline lists', () => {
    expect(markdownToPlainText('&bullet; первый\n&bullet; второй')).toBe(
      '• первый\n• второй',
    );
  });

  it('normalizes dash plus bullet marker', () => {
    expect(markdownToPlainText('- • пункт')).toBe('• пункт');
  });

  it('splits inline bullets into separate lines', () => {
    expect(markdownToPlainText('• первый • второй')).toBe('• первый\n• второй');
  });

  it('splits inline dash list into separate lines', () => {
    expect(markdownToPlainText('- первый - второй')).toBe('• первый\n• второй');
  });
});

describe('resolveEditSuggestion', () => {
  it('keeps plain edits unchanged', () => {
    expect(resolveEditSuggestion('текст', 'plain')).toEqual({
      raw: 'текст',
      plain: 'текст',
      docxPlain: 'текст',
      docxRunsXml: null,
    });
  });

  it('strips markdown for pdf plain', () => {
    const resolved = resolveEditSuggestion('- **новый** текст', 'markdown');
    expect(resolved.plain).toBe('• новый текст');
    expect(resolved.docxPlain).toBe('• новый текст');
  });

  it('builds docx runs for inline bold', () => {
    const resolved = resolveEditSuggestion('**важно**', 'markdown');
    expect(resolved.docxRunsXml).toContain('<w:b/>');
    expect(resolved.docxRunsXml).toContain('важно');
  });

  it('keeps all list lines for docx plain and multiline runs', () => {
    const resolved = resolveEditSuggestion('- первый\n- второй', 'markdown');
    expect(resolved.plain).toBe('• первый\n• второй');
    expect(resolved.docxPlain).toBe('• первый\n• второй');
    expect(resolved.docxRunsXml).toContain('<w:br/>');
    expect(resolved.docxRunsXml).toContain('второй');
  });
});

describe('plainMultilineToDocxXml', () => {
  it('inserts line breaks between list items', () => {
    const xml = plainMultilineToDocxXml('• один\n• два');
    expect(xml).toContain('<w:br/>');
    expect(xml).toContain('два');
  });
});

describe('markdownInlineToDocxXml', () => {
  it('escapes xml entities', () => {
    expect(markdownInlineToDocxXml('a & b')).toContain('&amp;');
  });
});

describe('parseInlineMarkdown', () => {
  it('parses mixed styles', () => {
    expect(parseInlineMarkdown('**b** and *i*')).toEqual([
      { text: 'b', bold: true },
      { text: ' and ', bold: undefined },
      { text: 'i', italic: true },
    ]);
  });
});

describe('meta helpers', () => {
  it('reads markdown format from meta', () => {
    expect(readContentFormat({ contentFormat: 'markdown' })).toBe('markdown');
    expect(readContentFormat({})).toBe('plain');
  });

  it('defaults accepted edits to markdown without meta', () => {
    expect(readAcceptedEditContentFormat({})).toBe('markdown');
    expect(readAcceptedEditContentFormat({ contentFormat: 'plain' })).toBe('plain');
  });

  it('stores markdown flag in meta', () => {
    expect(annotationMetaWithContentFormat({ pageAnchor: { xNorm: 0.1, yNorm: 0.2 } }, 'markdown')).toEqual({
      pageAnchor: { xNorm: 0.1, yNorm: 0.2 },
      contentFormat: 'markdown',
    });
  });
});

describe('hasInlineMarkdownFormatting', () => {
  it('detects bold marker', () => {
    expect(hasInlineMarkdownFormatting('plain')).toBe(false);
    expect(hasInlineMarkdownFormatting('**x**')).toBe(true);
  });
});
