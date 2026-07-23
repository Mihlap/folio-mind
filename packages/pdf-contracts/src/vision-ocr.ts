import type { ExtractedDocumentText, PageText } from './extracted-text.js';

/** Average chars per page below this → treat as scan / image PDF. */
export const VISION_OCR_MIN_CHARS_PER_PAGE = 40;
/** Absolute floor for whole-document text. */
export const VISION_OCR_MIN_TOTAL_CHARS = 80;
/** Max pages to send through vision OCR (cost/latency guard). */
export const VISION_OCR_MAX_PAGES = 20;

export type VisionOcrStatus =
  | 'queued'
  | 'processing'
  | 'ready'
  | 'failed'
  | 'skipped'
  | 'not_needed';

export function isVisionOcrStatus(value: unknown): value is VisionOcrStatus {
  return (
    value === 'queued' ||
    value === 'processing' ||
    value === 'ready' ||
    value === 'failed' ||
    value === 'skipped' ||
    value === 'not_needed'
  );
}

/**
 * Decide whether pdfjs text layer is too thin for chat/RAG (typical scans).
 * Safe default: false when pageCount unknown and some text exists.
 */
export function needsVisionOcr(params: {
  text: string;
  pages: PageText[];
  pageCount: number;
}): boolean {
  const pageCount = Math.max(0, params.pageCount);
  const totalChars = params.text.trim().length;
  if (pageCount <= 0) return totalChars < VISION_OCR_MIN_TOTAL_CHARS;
  if (totalChars === 0) return true;
  if (totalChars < VISION_OCR_MIN_TOTAL_CHARS) return true;
  const avg = totalChars / pageCount;
  return avg < VISION_OCR_MIN_CHARS_PER_PAGE;
}

export function buildExtractedTextPayload(params: {
  text: string;
  pages: PageText[];
  source: ExtractedDocumentText['source'];
}): ExtractedDocumentText {
  return {
    text: params.text,
    pages: params.pages,
    extractedAt: new Date().toISOString(),
    source: params.source,
  };
}
