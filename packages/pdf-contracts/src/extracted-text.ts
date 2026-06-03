export type PageText = {
  page: number;
  text: string;
};

export type ExtractedDocumentText = {
  text: string;
  pages: PageText[];
  extractedAt?: string;
};

export function normalizePageTexts(pages: PageText[]): PageText[] {
  return pages
    .filter((p) => p.text.trim().length > 0)
    .map((p) => ({ page: p.page, text: p.text.trim() }))
    .sort((a, b) => a.page - b.page);
}

/** Поддержка legacy `{ text }` и нового `{ text, pages }`. */
export function parseExtractedTextJson(raw: string): ExtractedDocumentText {
  const parsed = JSON.parse(raw) as {
    text?: string;
    pages?: PageText[];
    extractedAt?: string;
  };

  const text = typeof parsed.text === 'string' ? parsed.text : '';

  if (Array.isArray(parsed.pages) && parsed.pages.length > 0) {
    return {
      text,
      pages: normalizePageTexts(parsed.pages),
      extractedAt: parsed.extractedAt,
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
  };
}
