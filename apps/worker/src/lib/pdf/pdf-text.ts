import { getDocument, GlobalWorkerOptions, VerbosityLevel } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { PageText } from '@folio-mind/pdf-contracts';
const require = createRequire(import.meta.url);
const pdfjsPkgDir = dirname(require.resolve('pdfjs-dist/package.json'));
GlobalWorkerOptions.workerSrc = pathToFileURL(
  join(pdfjsPkgDir, 'legacy/build/pdf.worker.mjs'),
).href;
const standardFontDataUrl = `${pathToFileURL(join(pdfjsPkgDir, 'standard_fonts')).href}/`;
const MAX_PAGES = 50;
const PREVIEW_MAX_CHARS = 12000;
const AI_MAX_CHARS = 100000;

export type ExtractTextResult = {
  text: string;
  pages: PageText[];
  pageCount: number;
};

async function extractTextFromPdfWithLimits(
  buffer: Buffer,
  maxChars: number,
  maxPages: number,
): Promise<ExtractTextResult> {
  const task = getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    disableFontFace: true,
    standardFontDataUrl,
    verbosity: VerbosityLevel.ERRORS,
  });
  const pdf = await task.promise;
  const pageCount = pdf.numPages;
  const limit = Math.min(pageCount, maxPages);
  const pages: PageText[] = [];
  for (let i = 1; i <= limit; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(textItemToString).join(' ').replace(/\s+/g, ' ').trim();
    if (pageText) pages.push({ page: i, text: pageText });
    if (pages.map((p) => p.text).join('\n\n').length >= maxChars) break;
  }
  await pdf.destroy();
  let full = pages
    .map((p) => p.text)
    .join('\n\n')
    .trim();
  if (full.length > maxChars) {
    full = `${full.slice(0, maxChars)}…`;
    let total = 0;
    const trimmedPages: PageText[] = [];
    for (const page of pages) {
      if (total + page.text.length > maxChars) break;
      trimmedPages.push(page);
      total += page.text.length + 2;
    }
    return { text: full, pages: trimmedPages, pageCount };
  }
  return { text: full, pages, pageCount };
}

export async function extractTextFromPdf(buffer: Buffer): Promise<ExtractTextResult> {
  return extractTextFromPdfWithLimits(buffer, PREVIEW_MAX_CHARS, MAX_PAGES);
}

/** Полное извлечение для ИИ: до 50 страниц и ~100k символов (кэш превью обрезает до 12k). */
export async function extractTextFromPdfForAi(buffer: Buffer): Promise<ExtractTextResult> {
  return extractTextFromPdfWithLimits(buffer, AI_MAX_CHARS, MAX_PAGES);
}

export async function extractSinglePageTextFromPdf(
  buffer: Buffer,
  pageNumber: number,
): Promise<PageText | null> {
  if (!Number.isInteger(pageNumber) || pageNumber < 1) return null;
  const task = getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    disableFontFace: true,
    standardFontDataUrl,
    verbosity: VerbosityLevel.ERRORS,
  });
  const pdf = await task.promise;
  try {
    if (pageNumber > pdf.numPages) return null;
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageText = content.items.map(textItemToString).join(' ').replace(/\s+/g, ' ').trim();
    return pageText ? { page: pageNumber, text: pageText } : null;
  } finally {
    await pdf.destroy();
  }
}
function textItemToString(item: unknown): string {
  if (typeof item !== 'object' || item === null) return '';
  if (
    'str' in item &&
    typeof (
      item as {
        str: unknown;
      }
    ).str === 'string'
  ) {
    return (
      item as {
        str: string;
      }
    ).str;
  }
  return '';
}
