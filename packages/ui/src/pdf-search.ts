import type * as pdfjs from 'pdfjs-dist';

export type PdfSearchMatch = {
  page: number;
  matchIndex: number;
  snippet: string;
};

function normalizeForSearch(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function searchPdfText(
  pdf: pdfjs.PDFDocumentProxy,
  query: string,
): Promise<PdfSearchMatch[]> {
  const normalized = normalizeForSearch(query);
  if (!normalized) return [];

  const matches: PdfSearchMatch[] = [];
  let matchIndex = 0;

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const rawPageText = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ');
    const pageText = normalizeForSearch(rawPageText);
    if (!pageText) continue;
    let from = 0;

    while (from < pageText.length) {
      const found = pageText.indexOf(normalized, from);
      if (found === -1) break;

      const start = Math.max(0, found - 30);
      const end = Math.min(pageText.length, found + normalized.length + 30);
      matches.push({
        page: pageNum,
        matchIndex,
        snippet: pageText.slice(start, end).trim(),
      });
      matchIndex += 1;
      from = found + normalized.length;
    }
  }

  return matches;
}
