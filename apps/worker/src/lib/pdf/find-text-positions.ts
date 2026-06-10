import { getDocument, GlobalWorkerOptions, VerbosityLevel } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const pdfjsPkgDir = dirname(require.resolve('pdfjs-dist/package.json'));

GlobalWorkerOptions.workerSrc = pathToFileURL(
  join(pdfjsPkgDir, 'legacy/build/pdf.worker.mjs'),
).href;

const standardFontDataUrl = `${pathToFileURL(join(pdfjsPkgDir, 'standard_fonts')).href}/`;

export type TextBoxPosition = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type TextItem = {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

function norm(str: string): string {
  return str.replace(/\s+/g, ' ').trim();
}

function collectPageItems(pdf: any, pageNumber: number): Promise<TextItem[]> {
  return pdf.getPage(pageNumber).then((page: any) =>
    page.getTextContent().then((content: any) =>
      content.items
        .filter((item: any) => item.str)
        .map((item: any) => ({
          str: item.str,
          x: item.transform[4],
          y: item.transform[5],
          width: item.width ?? 0,
          height: item.height ?? 0,
        })),
    ),
  );
}

function searchTextInItems(
  items: TextItem[],
  searchText: string,
): TextBoxPosition[] {
  const needle = norm(searchText);
  if (!needle) return [];

  const results: TextBoxPosition[] = [];
  const used = new Set<number>();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const haystack = norm(item.str);
    if (!haystack) continue;

    const idx = haystack.indexOf(needle);
    if (idx === -1) continue;

    used.add(i);

    const charWidth = item.width / Math.max(haystack.length, 1);
    results.push({
      x: item.x + idx * charWidth,
      y: item.y - (item.height || 10) * 0.15,
      width: needle.length * charWidth,
      height: (item.height || 10) * 1.3,
    });
  }

  if (results.length > 0) return results;

  for (let i = 0; i < items.length; i++) {
    if (used.has(i)) continue;
    const item = items[i];
    const haystack = norm(item.str);
    if (!haystack) continue;

    if (needle.indexOf(haystack) !== -1) {
      const charWidth = item.width / Math.max(haystack.length, 1);
      results.push({
        x: item.x,
        y: item.y - (item.height || 10) * 0.15,
        width: item.width,
        height: (item.height || 10) * 1.3,
      });
      used.add(i);
    }
  }

  return results;
}

export async function findTextPositions(
  buffer: Buffer,
  pageNumber: number,
  searchText: string,
): Promise<TextBoxPosition[]> {
  const task = getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    disableFontFace: true,
    standardFontDataUrl,
    verbosity: VerbosityLevel.ERRORS,
  });
  const pdf = await task.promise;

  try {
    if (pageNumber < 1 || pageNumber > pdf.numPages) return [];
    const items = await collectPageItems(pdf, pageNumber);
    return searchTextInItems(items, searchText);
  } finally {
    await pdf.destroy();
  }
}

export async function findAllTextPositions(
  buffer: Buffer,
  edits: Array<{ page: number; originalText: string }>,
): Promise<Map<number, Map<string, TextBoxPosition[]>>> {
  const task = getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    disableFontFace: true,
    standardFontDataUrl,
    verbosity: VerbosityLevel.ERRORS,
  });
  const pdf = await task.promise;

  const result = new Map<number, Map<string, TextBoxPosition[]>>();

  try {
    const grouped = new Map<number, typeof edits>();
    for (const edit of edits) {
      const page = edit.page;
      if (!grouped.has(page)) grouped.set(page, []);
      grouped.get(page)!.push(edit);
    }

    for (const [pageNumber, pageEdits] of grouped) {
      if (pageNumber < 1 || pageNumber > pdf.numPages) continue;

      const items = await collectPageItems(pdf, pageNumber);
      const pageMap = new Map<string, TextBoxPosition[]>();

      for (const edit of pageEdits) {
        const positions = searchTextInItems(items, edit.originalText);
        if (positions.length > 0) {
          pageMap.set(edit.originalText, positions);
        }
      }

      if (pageMap.size > 0) {
        result.set(pageNumber, pageMap);
      }
    }
  } finally {
    await pdf.destroy();
  }

  return result;
}
