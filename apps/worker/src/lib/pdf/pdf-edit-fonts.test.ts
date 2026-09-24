import { StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { pickEmbeddedFontBytes, pickStandardFont } from './pdf-edit-fonts.js';

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
