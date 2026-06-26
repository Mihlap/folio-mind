import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
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
};
function isSerifFamily(fontFamily: string): boolean {
  const f = fontFamily.toLowerCase();
  return (
    f.includes('times') ||
    f.includes('serif') ||
    f.includes('georgia') ||
    f.includes('cambria') ||
    f.includes('garamond')
  );
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
  private serif: PDFFont | null = null;
  private sans: PDFFont | null = null;
  async resolve(
    pdfDoc: PDFDocument,
    style: PdfTextStyle,
    fontBytesByName: Map<string, Uint8Array>,
  ): Promise<PDFFont> {
    const embeddedBytes = fontBytesByName.get(style.fontName);
    if (embeddedBytes) {
      const cached = this.embedded.get(style.fontName);
      if (cached) return cached;
      const font = await pdfDoc.embedFont(embeddedBytes);
      this.embedded.set(style.fontName, font);
      return font;
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
  },
  fontNames: Iterable<string>,
): Promise<Map<string, Uint8Array>> {
  const out = new Map<string, Uint8Array>();
  for (const fontName of fontNames) {
    if (!fontName || out.has(fontName)) continue;
    try {
      const font = (await page.commonObjs.get(fontName)) as { data?: Uint8Array } | null;
      if (font?.data instanceof Uint8Array && font.data.length > 64) {
        out.set(fontName, font.data);
      }
    } catch {
      // шрифт не встроен или недоступен
    }
  }
  return out;
}
