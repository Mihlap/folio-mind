import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { fitReplacementOnPage, wrapTextToWidth } from './pdf-fit-replacement-text.js';

describe('pdf-fit-replacement-text', () => {
  it('wraps long text to page width', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const lines = wrapTextToWidth(
      font,
      'This is a very long line of text that should not fit on a single line within the narrow page width limit',
      12,
      180,
    );
    expect(lines.length).toBeGreaterThan(1);
  });

  it('fits multi-line replacement within page bottom margin', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const long =
      'For example, the publication discusses a special case. A more general case is discussed in another article by the author. Additional long paragraph to verify wrapping behavior.';
    const { lines } = fitReplacementOnPage({
      font,
      text: long,
      baseFontSize: 12,
      startX: 72,
      startY: 400,
      pageWidth: 595,
      pageHeight: 842,
    });
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((line) => line.y >= 36)).toBe(true);
  });
});
