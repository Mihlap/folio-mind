import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { StandardFonts } from 'pdf-lib';
import type { PDFDocument, PDFFont } from 'pdf-lib';
import type { TextItem } from './find-text-positions.js';
const require = createRequire(import.meta.url);
const FALLBACK_SERIF_PATH = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSerif.ttf');
const FALLBACK_SANS_PATH = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans.ttf');
export type PdfTextStyle = {
  fontSize: number;
  fontName: string;
  fontFamily: string;
  lineHeight: number;
  ascent?: number;
  descent?: number;
  fontWidth?: number;
  fontBoundingBoxAscent?: number;
  fontBoundingBoxDescent?: number;
  fontSubstitution?: string;
  fontVariationSettings?: string;
};
function isSerifFamily(fontFamily: string): boolean {
  const f = fontFamily.toLowerCase();
  if (f.includes('sans')) return false;
  return (
    f.includes('times') ||
    f.includes('serif') ||
    f.includes('georgia') ||
    f.includes('cambria') ||
    f.includes('garamond')
  );
}
export function fontSizeFromTextItems(items: TextItem[]): number {
  if (items.length === 0) return 12;
  let weighted = 0;
  let chars = 0;
  for (const item of items) {
    const c = Math.max(item.str.length, 1);
    const size = item.height > 0 ? item.height : item.fontSize > 0 ? item.fontSize : 12;
    weighted += size * c;
    chars += c;
  }
  return Math.max(6, Math.min(chars > 0 ? weighted / chars : 12, 72));
}

function scoreEmbeddedFontName(fontName: string, style: PdfTextStyle): number {
  const lower = fontName.toLowerCase();
  if (fontName === style.fontName) return 1000;
  let score = 0;
  if (style.fontName && lower.includes(style.fontName.toLowerCase())) score += 200;
  for (const token of style.fontFamily.toLowerCase().split(/[\s,"]+/)) {
    if (token.length > 2 && lower.includes(token)) score += 60;
  }
  if (isSerifFamily(style.fontFamily)) {
    if (lower.includes('times') || lower.includes('serif') || lower.includes('cambria')) score += 40;
  } else if (lower.includes('arial') || lower.includes('helv') || lower.includes('sans')) {
    score += 40;
  }
  return score;
}

export function pickEmbeddedFontBytes(
  style: PdfTextStyle,
  fontBytesByName: Map<string, Uint8Array>,
): { fontName: string; bytes: Uint8Array } | null {
  const exact = fontBytesByName.get(style.fontName);
  if (exact) return { fontName: style.fontName, bytes: exact };

  let best: { fontName: string; bytes: Uint8Array; score: number } | null = null;
  for (const [fontName, bytes] of fontBytesByName) {
    const score = scoreEmbeddedFontName(fontName, style);
    if (score > 0 && (!best || score > best.score)) {
      best = { fontName, bytes, score };
    }
  }
  if (best && best.score >= 40) {
    return { fontName: best.fontName, bytes: best.bytes };
  }
  return null;
}

export function pickStandardFont(style: PdfTextStyle): StandardFonts | null {
  const raw = `${style.fontName} ${style.fontFamily} ${style.fontSubstitution ?? ''} ${style.fontVariationSettings ?? ''}`.toLowerCase();
  if (!raw.trim()) return null;
  const bold = /bold|black|semibold|demi|heavy|\b[789]00\b/.test(raw);
  const italic = /italic|oblique|slanted/.test(raw);
  const mono = /courier|consol|monaco|liberation mono|dejavu sans mono/.test(raw);
  const serif =
    !mono &&
    /times|georgia|cambria|garamond|book antiqua|palatino|bookman|liberation serif/.test(raw) &&
    !/sans/.test(raw);
  const sans =
    !mono &&
    !serif &&
    /arial|helv|calibri|segoe|roboto|inter|verdana|tahoma|trebuchet|liberation sans/.test(raw);
  if (mono) {
    if (bold && italic) return StandardFonts.CourierBoldOblique;
    if (bold) return StandardFonts.CourierBold;
    if (italic) return StandardFonts.CourierOblique;
    return StandardFonts.Courier;
  }
  if (serif) {
    if (bold && italic) return StandardFonts.TimesRomanBoldItalic;
    if (bold) return StandardFonts.TimesRomanBold;
    if (italic) return StandardFonts.TimesRomanItalic;
    return StandardFonts.TimesRoman;
  }
  if (sans) {
    if (bold && italic) return StandardFonts.HelveticaBoldOblique;
    if (bold) return StandardFonts.HelveticaBold;
    if (italic) return StandardFonts.HelveticaOblique;
    return StandardFonts.Helvetica;
  }
  return null;
}

function canEncodeWithStandardFont(text: string): boolean {
  for (const char of text) {
    if ((char.codePointAt(0) ?? 0) > 0xff) return false;
  }
  return true;
}

export function calibrateFontSize(item: TextItem, font: PDFFont): number {
  const base = item.height > 0 ? item.height : item.fontSize > 0 ? item.fontSize : 12;
  const text = item.str.trim();
  if (!text || item.width <= 0) return base;
  let low = base * 0.75;
  let high = base * 1.25;
  for (let i = 0; i < 14; i++) {
    const mid = (low + high) / 2;
    const w = font.widthOfTextAtSize(text, mid);
    if (w < item.width * 0.98) low = mid;
    else high = mid;
  }
  return Math.max(6, Math.min((low + high) / 2, 72));
}
export class PdfEditFontCache {
  private readonly embedded = new Map<string, PDFFont>();
  private readonly standard = new Map<string, PDFFont>();
  private serif: PDFFont | null = null;
  private sans: PDFFont | null = null;
  private async embedNamedFont(
    pdfDoc: PDFDocument,
    fontName: string,
    bytes: Uint8Array,
  ): Promise<PDFFont> {
    const cached = this.embedded.get(fontName);
    if (cached) return cached;
    const font = await pdfDoc.embedFont(bytes);
    this.embedded.set(fontName, font);
    return font;
  }
  private async embedStandardFont(
    pdfDoc: PDFDocument,
    standardFont: StandardFonts,
  ): Promise<PDFFont> {
    const cached = this.standard.get(standardFont);
    if (cached) return cached;
    const font = await pdfDoc.embedFont(standardFont);
    this.standard.set(standardFont, font);
    return font;
  }
  async resolve(
    pdfDoc: PDFDocument,
    style: PdfTextStyle,
    fontBytesByName: Map<string, Uint8Array>,
    sampleText?: string,
  ): Promise<PDFFont> {
    const picked = pickEmbeddedFontBytes(style, fontBytesByName);
    if (picked) {
      return this.embedNamedFont(pdfDoc, picked.fontName, picked.bytes);
    }
    const standardFont = pickStandardFont(style);
    if (standardFont && sampleText != null && canEncodeWithStandardFont(sampleText)) {
      return this.embedStandardFont(pdfDoc, standardFont);
    }
    const fallbackKey = isSerifFamily(style.fontFamily) ? 'fallback-serif' : 'fallback-sans';
    if (fallbackKey === 'fallback-serif') {
      if (!this.serif) {
        this.serif = await pdfDoc.embedFont(readFileSync(FALLBACK_SERIF_PATH));
      }
      return this.serif;
    }
    if (!this.sans) {
      this.sans = await pdfDoc.embedFont(readFileSync(FALLBACK_SANS_PATH));
    }
    return this.sans;
  }
}
export async function collectEmbeddedFontBytes(
  page: {
    commonObjs: { get: (name: string) => Promise<unknown> };
    objs?: { get: (name: string) => Promise<unknown> };
  },
  fontNames: Iterable<string>,
): Promise<Map<string, Uint8Array>> {
  const out = new Map<string, Uint8Array>();
  const tryStore = async (
    store: { get: (name: string) => Promise<unknown> },
    fontName: string,
  ): Promise<void> => {
    const font = (await store.get(fontName)) as { data?: Uint8Array } | null;
    if (font?.data instanceof Uint8Array && font.data.length > 64) {
      out.set(fontName, font.data);
    }
  };
  for (const fontName of fontNames) {
    if (!fontName || out.has(fontName)) continue;
    try {
      await tryStore(page.commonObjs, fontName);
      if (!out.has(fontName) && page.objs) {
        await tryStore(page.objs, fontName);
      }
    } catch {
      // Some embedded fonts are not exposed by pdf.js; skip them.
    }
  }
  return out;
}
