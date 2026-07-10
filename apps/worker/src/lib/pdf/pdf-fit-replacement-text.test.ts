import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import {
  fitReplacementAtLayoutLines,
  fitReplacementOnPage,
  layoutLineSpacings,
  wrapTextToWidth,
  yForWrappedLineIndex,
} from './pdf-fit-replacement-text.js';

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

  it('places wrapped lines on original PDF baselines', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const layoutLines = [
      { x: 72, y: 700 },
      { x: 72, y: 684 },
      { x: 72, y: 668 },
    ];
    expect(layoutLineSpacings(layoutLines)).toEqual([16, 16]);
    expect(yForWrappedLineIndex(1, layoutLines, 16)).toBe(684);
    expect(yForWrappedLineIndex(3, layoutLines, 16)).toBe(652);

    const { lines } = fitReplacementAtLayoutLines({
      font,
      text: 'First sentence in paragraph. Second sentence continues here. Third sentence wraps to another line.',
      baseFontSize: 12,
      layoutLines,
      pageWidth: 595,
      pageHeight: 842,
    });
    expect(lines.length).toBeGreaterThan(1);
    expect(lines[0]!.y).toBe(700);
    expect(lines[1]!.y).toBe(684);
    expect(lines[0]!.fontSize).toBe(12);
  });
});
