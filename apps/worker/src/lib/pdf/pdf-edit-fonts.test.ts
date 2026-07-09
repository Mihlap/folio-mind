import { describe, expect, it } from 'vitest';
import { pickEmbeddedFontBytes } from './pdf-edit-fonts.js';

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
