import { extractedTextKey, parseExtractedTextJson } from '@folio-mind/pdf-contracts';
import { getObjectBuffer } from '../storage/s3.js';
import { normalizeForMatch } from './apply-edits.js';

export type PageTextHint = {
  page: number;
  text: string;
};

/** Загружает text.json для версии (если есть). */
export async function loadPageTextHints(
  documentId: string,
  versionId: string,
): Promise<PageTextHint[]> {
  try {
    const key = extractedTextKey(documentId, versionId);
    const raw = await getObjectBuffer(key);
    const parsed = parseExtractedTextJson(raw.toString('utf8'));
    return parsed.pages.map((p) => ({ page: p.page, text: p.text }));
  } catch {
    return [];
  }
}

/**
 * Расширяет фразу «было» контекстом со страницы PDF — помогает выбрать одно вхождение в DOCX.
 */
export function buildPageContextSearchVariants(
  pageText: string | undefined,
  originalText: string,
): string[] {
  if (!pageText?.trim()) return [];
  const normPage = normalizeForMatch(pageText);
  const normSearch = normalizeForMatch(originalText);
  if (!normSearch || !normPage.includes(normSearch)) return [];

  const idx = normPage.indexOf(normSearch);
  const before = Math.max(0, idx - 40);
  const after = Math.min(normPage.length, idx + normSearch.length + 40);
  const extended = pageText.slice(
    Math.max(0, pageText.toLowerCase().indexOf(originalText.toLowerCase().slice(0, 8)) - 20),
    pageText.length,
  );

  const variants: string[] = [];
  const contextSlice = normPage.slice(before, after);
  if (contextSlice.length > normSearch.length + 4) {
    variants.push(contextSlice);
  }
  if (extended.length > originalText.length + 4 && extended !== originalText) {
    variants.push(extended.trim());
  }
  return [...new Set(variants.filter((v) => v.length > originalText.length))];
}

export function getPageTextForEdit(
  hints: PageTextHint[],
  page: number,
): string | undefined {
  return hints.find((h) => h.page === page)?.text;
}
