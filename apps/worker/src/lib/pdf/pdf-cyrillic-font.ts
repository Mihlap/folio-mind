import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import fontkit from '@pdf-lib/fontkit';
import type { PDFDocument, PDFFont } from 'pdf-lib';
const require = createRequire(import.meta.url);
export function registerPdfFontkit(pdfDoc: PDFDocument): void {
  pdfDoc.registerFontkit(fontkit);
}
export async function embedCyrillicFont(pdfDoc: PDFDocument): Promise<PDFFont> {
  const fontPath = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans.ttf');
  const bytes = readFileSync(fontPath);
  return pdfDoc.embedFont(bytes);
}
export function truncateForPdf(text: string, max = 220): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max - 1)}…`;
}
