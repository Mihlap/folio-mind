import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { getDocument, GlobalWorkerOptions, VerbosityLevel } from 'pdfjs-dist/legacy/build/pdf.mjs';

const require = createRequire(import.meta.url);
const pdfjsPkgDir = dirname(require.resolve('pdfjs-dist/package.json'));

GlobalWorkerOptions.workerSrc = pathToFileURL(
  join(pdfjsPkgDir, 'legacy/build/pdf.worker.mjs'),
).href;

const standardFontDataUrl = `${pathToFileURL(join(pdfjsPkgDir, 'standard_fonts')).href}/`;

const MAX_PAGES = 50;
const MAX_CHARS = 12_000;

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const task = getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    disableFontFace: true,
    standardFontDataUrl,
    verbosity: VerbosityLevel.ERRORS,
  });
  const pdf = await task.promise;

  const pageCount = Math.min(pdf.numPages, MAX_PAGES);
  const parts: string[] = [];

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(textItemToString).join(' ').replace(/\s+/g, ' ').trim();
    if (pageText) parts.push(pageText);
    if (parts.join('\n').length >= MAX_CHARS) break;
  }

  await pdf.destroy();

  const full = parts.join('\n\n').trim();
  if (full.length <= MAX_CHARS) return full;
  return `${full.slice(0, MAX_CHARS)}…`;
}

function textItemToString(item: unknown): string {
  if (typeof item !== 'object' || item === null) return '';
  if ('str' in item && typeof (item as { str: unknown }).str === 'string') {
    return (item as { str: string }).str;
  }
  return '';
}
