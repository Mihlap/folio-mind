import {
  extractedTextKey,
  parseExtractedTextJson,
  type PageText,
} from '@folio-mind/pdf-contracts';
import { extractTextFromPdf, extractTextFromPdfForAi, extractSinglePageTextFromPdf, getAiExtractMaxPages } from './pdf-text.js';
import { tryGetObjectBuffer } from '../storage/s3.js';

export type AiSuggestionsScope = 'document' | 'page';

export async function loadDocumentText(
  documentId: string,
  versionId: string,
  pdfBuffer: Buffer,
): Promise<string> {
  const pages = await loadDocumentPages(documentId, versionId, pdfBuffer);
  if (pages.length > 0) {
    return pages.map((p) => p.text).join('\n\n');
  }
  const extracted = await extractTextFromPdf(pdfBuffer);
  return extracted.text;
}

async function loadDocumentPages(
  documentId: string,
  versionId: string,
  pdfBuffer: Buffer,
): Promise<PageText[]> {
  const textJson = await tryGetObjectBuffer(extractedTextKey(documentId, versionId));
  if (textJson) {
    try {
      const parsed = parseExtractedTextJson(textJson.toString('utf8'));
      if (parsed.pages.length > 0) return parsed.pages;
    } catch {
      // Ignore stale/corrupt cache and extract text from the PDF below.
    }
  }
  const extracted = await extractTextFromPdf(pdfBuffer);
  return extracted.pages;
}

const PREVIEW_TEXT_CHAR_CAP = 12_000;

function isPagesExtractionIncomplete(
  pages: PageText[],
  pdfPageCount: number | null | undefined,
): boolean {
  if (pages.length === 0) return true;
  const totalChars = pages.reduce((sum, page) => sum + page.text.length, 0);
  const aiMaxPages = getAiExtractMaxPages();
  const expectedPages = pdfPageCount ? Math.min(pdfPageCount, aiMaxPages) : null;
  const lastPage = pages[pages.length - 1]?.page ?? 0;

  if (totalChars >= PREVIEW_TEXT_CHAR_CAP - 256) {
    if (!expectedPages || pages.length < expectedPages || lastPage < expectedPages) {
      return true;
    }
  }
  if (!expectedPages || expectedPages <= 1) return false;
  return lastPage < expectedPages;
}

/** Для ИИ/RAG: при неполном кэше превью перечитывает PDF (до EXTRACT_AI_MAX_PAGES). */
export async function loadDocumentPagesForAi(
  documentId: string,
  versionId: string,
  pdfBuffer: Buffer,
  pdfPageCount?: number | null,
): Promise<PageText[]> {
  const textJson = await tryGetObjectBuffer(extractedTextKey(documentId, versionId));
  let cached: PageText[] | null = null;
  if (textJson) {
    try {
      const parsed = parseExtractedTextJson(textJson.toString('utf8'));
      if (parsed.pages.length > 0) cached = parsed.pages;
    } catch {
      // Ignore stale/corrupt cache and extract text from the PDF below.
    }
  }
  if (cached && !isPagesExtractionIncomplete(cached, pdfPageCount)) {
    return cached;
  }
  const extracted = await extractTextFromPdfForAi(pdfBuffer);
  if (extracted.pages.length > 0) return extracted.pages;
  return cached ?? [];
}

export function formatPagesForAiPrompt(pages: PageText[]): string {
  return pages.map((p) => `--- Страница ${p.page} ---\n${p.text}`).join('\n\n');
}

export async function resolveAiSuggestionsPages(
  pages: PageText[],
  scope: AiSuggestionsScope,
  page: number | undefined,
  pdfBuffer?: Buffer,
): Promise<PageText[]> {
  if (scope !== 'page') return pages;
  if (!page) throw new Error('Не указан номер страницы');
  const match = pages.find((p) => p.page === page);
  if (match?.text.trim()) return [match];
  if (pdfBuffer) {
    const single = await extractSinglePageTextFromPdf(pdfBuffer, page);
    if (single?.text.trim()) return [single];
  }
  throw new Error(`На странице ${page} нет текста для анализа`);
}
