import type { ExtractedDocumentText, PageText } from './extracted-text.js';

export const VISION_OCR_MIN_CHARS_PER_PAGE = 40;

export const VISION_OCR_MIN_TOTAL_CHARS = 80;

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

export const TEXTLESS_SCAN_REASON =
  'Скан без текстового слоя: поиск, замена и выделение текста в PDF недоступны. Распознайте текст или загрузите PDF с текстовым слоем.';
export const TEXTLESS_SCAN_EDIT_REASON =
  'Правка текста в PDF недоступна: в файле нет текстового слоя. Распознайте текст или загрузите исходный DOCX.';
export const TEXTLESS_SCAN_CONVERT_REASON =
  'Подсветка правок в DOCX требует текстового слоя: для скана используйте «Собрать PDF с правками».';

export function isTextlessScanVersion(params: {
  textSource?: string | null;
  visionOcrStatus?: string | null;
}): boolean {
  if (params.textSource === 'vision-ocr') return false;
  return params.visionOcrStatus === 'failed' || params.visionOcrStatus === 'skipped';
}

export function isVisionOcrInProgressStatus(status?: string | null): boolean {
  return status === 'queued' || status === 'processing';
}

export function isPdfTextLayerUnavailable(params: {
  textSource?: string | null;
  visionOcrStatus?: string | null;
}): boolean {
  if (params.textSource === 'vision-ocr') return true;
  if (isVisionOcrInProgressStatus(params.visionOcrStatus)) return true;
  return params.visionOcrStatus === 'failed' || params.visionOcrStatus === 'skipped';
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
