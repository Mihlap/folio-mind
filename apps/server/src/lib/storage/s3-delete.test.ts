import { describe, expect, it } from 'vitest';
import { collectVersionObjectKeys } from './s3.js';

describe('collectVersionObjectKeys', () => {
  it('includes pdf, source docx and derived processing keys', () => {
    const keys = collectVersionObjectKeys('doc-1', 'ver-1', {
      s3Key: 'folioFiles/originals/doc-1/v1-file.pdf',
      sourceDocxKey: 'folioFiles/originals/doc-1/v1-file.docx',
    });
    expect(keys).toContain('folioFiles/originals/doc-1/v1-file.pdf');
    expect(keys).toContain('folioFiles/originals/doc-1/v1-file.docx');
    expect(keys).toContain('folioFiles/processing/doc-1/ver-1/pre-converted.docx');
    expect(keys).toContain('folioFiles/processing/doc-1/ver-1/applied.docx');
  });

  it('skips pending keys', () => {
    const keys = collectVersionObjectKeys('doc-1', 'ver-1', {
      s3Key: 'pending',
      sourceDocxKey: null,
    });
    expect(keys.every((key) => key !== 'pending')).toBe(true);
  });

  it('includes export and text extraction keys', () => {
    const keys = collectVersionObjectKeys('doc-1', 'ver-3', {
      s3Key: 'folioFiles/originals/doc-1/v3-file.pdf',
      sourceDocxKey: null,
    });
    expect(keys).toContain('folioFiles/processing/doc-1/ver-3/text.json');
    expect(keys).toContain('folioFiles/exports/doc-1/ver-3/report.pdf');
  });
});
