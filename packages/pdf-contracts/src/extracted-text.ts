export type PageText = {
  page: number;
  text: string;
};

export type ExtractedTextSource = 'pdfjs' | 'vision-ocr';

export type ExtractedDocumentText = {
  text: string;
  pages: PageText[];
  extractedAt?: string;
  /** How text was obtained. Older caches omit this — treat as pdfjs. */
  source?: ExtractedTextSource;
};

export function normalizePageTexts(pages: PageText[]): PageText[] {
  return pages
    .filter((p) => p.text.trim().length > 0)
    .map((p) => ({ page: p.page, text: p.text.trim() }))
    .sort((a, b) => a.page - b.page);
}

export function parseExtractedTextJson(raw: string): ExtractedDocumentText {
  const parsed = JSON.parse(raw) as {
    text?: string;
    pages?: PageText[];
    extractedAt?: string;
    source?: string;
  };
  const text = typeof parsed.text === 'string' ? parsed.text : '';
  const source: ExtractedTextSource | undefined =
    parsed.source === 'vision-ocr' || parsed.source === 'pdfjs' ? parsed.source : undefined;
  if (Array.isArray(parsed.pages) && parsed.pages.length > 0) {
    return {
      text,
      pages: normalizePageTexts(parsed.pages),
      extractedAt: parsed.extractedAt,
      source,
    };
  }
  const parts = text
    .split(/\n\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return {
    text,
    pages: parts.map((part, index) => ({ page: index + 1, text: part })),
    extractedAt: parsed.extractedAt,
    source,
  };
}

