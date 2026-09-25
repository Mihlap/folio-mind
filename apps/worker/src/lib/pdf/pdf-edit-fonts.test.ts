import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { StandardFonts } from 'pdf-lib';
import type { PDFFont } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import {
  buildTextRuns,
  embeddedFontInfo,
  fontMissingChars,
  measureTextRunsWidth,
  pickEmbeddedFontBytes,
  pickStandardFont,
  type RunFonts,
} from './pdf-edit-fonts.js';

const require = createRequire(import.meta.url);
const DEJAVU_SERIF = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSerif.ttf');

describe('pickEmbeddedFontBytes', () => {
  it('prefers exact font name', () => {
    const bytes = new Uint8Array(128);
    const map = new Map([
      ['g_d1_f2', bytes],
      ['Arial-BoldMT', new Uint8Array(64)],
    ]);
    const picked = pickEmbeddedFontBytes(
      { fontName: 'g_d1_f2', fontFamily: 'Arial', fontSize: 12, lineHeight: 14 },
      map,
    );
    expect(picked?.fontName).toBe('g_d1_f2');
    expect(picked?.bytes).toBe(bytes);
  });

  it('matches by font family when exact name is missing', () => {
    const timesBytes = new Uint8Array(128);
    const map = new Map([['TimesNewRomanPSMT', timesBytes]]);
    const picked = pickEmbeddedFontBytes(
      { fontName: 'g_missing', fontFamily: 'Times New Roman', fontSize: 12, lineHeight: 14 },
      map,
    );
    expect(picked?.fontName).toBe('TimesNewRomanPSMT');
  });
});

describe('pickStandardFont', () => {
  it('keeps bold and italic variants for common base fonts', () => {
    expect(
      pickStandardFont({
        fontName: 'Arial-BoldItalicMT',
        fontFamily: 'Arial',
        fontSize: 12,
        lineHeight: 14,
      }),
    ).toBe(StandardFonts.HelveticaBoldOblique);
    expect(
      pickStandardFont({
        fontName: 'TimesNewRomanPS-ItalicMT',
        fontFamily: 'Times New Roman',
        fontSize: 12,
        lineHeight: 14,
      }),
    ).toBe(StandardFonts.TimesRomanItalic);
    expect(
      pickStandardFont({
        fontName: 'CourierNewPS-BoldMT',
        fontFamily: 'Courier New',
        fontSize: 12,
        lineHeight: 14,
      }),
    ).toBe(StandardFonts.CourierBold);
  });

  it('returns null for unknown custom fonts so Unicode fallback is used', () => {
    expect(
      pickStandardFont({
        fontName: 'g_d1_f2',
        fontFamily: 'Custom Sans Display',
        fontSize: 12,
        lineHeight: 14,
      }),
    ).toBeNull();
  });
});

describe('fontMissingChars', () => {
  const bytes = new Uint8Array(readFileSync(DEJAVU_SERIF));

  it('treats the space as a regular glyph requirement', () => {
    expect(fontMissingChars(bytes, 'Пункт 2.').size).toBe(0);
  });

  it('reports characters that the font cannot render', () => {
    const missing = fontMissingChars(bytes, 'Пункт\u{1F600}');
    expect([...missing]).toEqual(['\u{1F600}']);
  });
});

describe('embeddedFontInfo', () => {
  it('detects serif families and keeps unknown fonts without a standard match', () => {
    const bytes = new Uint8Array(readFileSync(DEJAVU_SERIF));
    const info = embeddedFontInfo(bytes);
    expect(info.serif).toBe(true);
    expect(info.standard).toBeNull();
  });
});

describe('buildTextRuns', () => {
  const makeFont = (width: number): PDFFont =>
    ({ widthOfTextAtSize: (text: string) => text.length * width }) as unknown as PDFFont;
  const primary = makeFont(10);
  const latin = makeFont(5);
  const fallback = makeFont(4);
  const runs: RunFonts = {
    primary,
    covers: (ch) => !' -В'.includes(ch),
    fallback,
    latin,
  };

  it('keeps covered characters in the embedded font', () => {
    expect(buildTextRuns('ИСПОЛНИТЕЛЬ', runs)).toEqual([
      { text: 'ИСПОЛНИТЕЛЬ', font: primary, latin: false },
    ]);
  });

  it('splits missing characters between the latin standard font and the fallback', () => {
    const segments = buildTextRuns('Пункт -В', runs);
    expect(
      segments.map((segment) => [
        segment.text,
        segment.font === primary ? 'primary' : segment.font === latin ? 'latin' : 'fallback',
      ]),
    ).toEqual([
      ['Пункт', 'primary'],
      [' -', 'latin'],
      ['В', 'fallback'],
    ]);
  });

  it('measures the combined width of all segments', () => {
    expect(measureTextRunsWidth('ИСПОЛНИТЕЛЬ', runs, 12)).toBe(11 * 10);
    expect(measureTextRunsWidth('ИСП -В', runs, 12)).toBe(3 * 10 + 2 * 5 + 4);
  });
});
