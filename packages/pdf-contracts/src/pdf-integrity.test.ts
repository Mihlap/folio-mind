import { describe, expect, it } from 'vitest';
import { analyzePdfIntegrity, parsePdfDate } from './pdf-integrity.js';

function minimalPdf(infoLines: string): Buffer {
  const body = `1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>
endobj
4 0 obj
<< ${infoLines} >>
endobj
trailer
<< /Size 5 /Root 1 0 R /Info 4 0 R >>
startxref
0
%%EOF`;
  return Buffer.from(`%PDF-1.4\n${body}`, 'latin1');
}

describe('parsePdfDate', () => {
  it('parses PDF date string', () => {
    const d = parsePdfDate("D:20231015143022+03'00'");
    expect(d?.getUTCFullYear()).toBe(2023);
    expect(d?.getUTCMonth()).toBe(9);
    expect(d?.getUTCDate()).toBe(15);
  });
});

describe('analyzePdfIntegrity', () => {
  it('marks single-save Word-like export as cannot_verify', () => {
    const pdf = minimalPdf(
      '/Creator (Microsoft Word) /Producer (Microsoft Word) /CreationDate (D:20240101120000Z) /ModDate (D:20240101120000Z)',
    );
    const result = analyzePdfIntegrity(pdf);
    expect(result.verdict).toBe('cannot_verify');
    expect(result.revisionCount).toBe(1);
  });

  it('detects multiple revisions', () => {
    const single = minimalPdf(
      '/Creator (Adobe Acrobat) /Producer (Adobe Acrobat) /CreationDate (D:20240101120000Z) /ModDate (D:20240201120000Z)',
    );
    const latin = single.toString('latin1');
    const appended = `${latin}\nxref\n0 1\n0000000000 65535 f \ntrailer\n<< /Size 1 /Prev 100 /Info 4 0 R >>\nstartxref\n0\n%%EOF`;
    const result = analyzePdfIntegrity(Buffer.from(appended, 'latin1'));
    expect(result.revisionCount).toBeGreaterThan(1);
    expect(result.verdict).toBe('modified');
    expect(result.score).toBeGreaterThanOrEqual(45);
  });

  it('strips null bytes from pdf metadata strings', () => {
    const pdf = minimalPdf(
      '/Creator (\u0000Adobe\u0000) /Producer (Test) /CreationDate (D:20240101120000Z) /ModDate (D:20240101120000Z)',
    );
    const result = analyzePdfIntegrity(pdf);
    expect(result.creator).toBe('Adobe');
    expect(result.creator).not.toContain('\u0000');
  });
});
