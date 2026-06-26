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
const MAX_CHARS = 12000;
export type ExtractTextResult = {
  text: string;
  pages: PageText[];
};
export async function extractTextFromPdf(buffer: Buffer): Promise<ExtractTextResult> {
  const task = getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    disableFontFace: true,
    standardFontDataUrl,
    verbosity: VerbosityLevel.ERRORS,
  });
  const pdf = await task.promise;
  const pageCount = Math.min(pdf.numPages, MAX_PAGES);
  const pages: PageText[] = [];
  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(textItemToString).join(' ').replace(/\s+/g, ' ').trim();
    if (pageText) pages.push({ page: i, text: pageText });
    if (pages.map((p) => p.text).join('\n\n').length >= MAX_CHARS) break;
  }
  await pdf.destroy();
  let full = pages
    .map((p) => p.text)
    .join('\n\n')
    .trim();
  if (full.length > MAX_CHARS) {
    full = `${full.slice(0, MAX_CHARS)}…`;
    let total = 0;
    const trimmedPages: PageText[] = [];
    for (const page of pages) {
      if (total + page.text.length > MAX_CHARS) break;
      trimmedPages.push(page);
      total += page.text.length + 2;
    }
    return { text: full, pages: trimmedPages };
  }
  return { text: full, pages };
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
