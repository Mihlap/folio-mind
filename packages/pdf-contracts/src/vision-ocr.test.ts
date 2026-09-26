import { describe, expect, it } from 'vitest';
import {
  isPdfTextLayerUnavailable,
  isTextlessScanVersion,
  isVisionOcrInProgressStatus,
  needsVisionOcr,
} from './vision-ocr.js';

describe('needsVisionOcr', () => {
  it('returns true for empty text with pages', () => {
    expect(needsVisionOcr({ text: '', pages: [], pageCount: 5 })).toBe(true);
  });

  it('returns false for dense text layer', () => {
    const text = 'а'.repeat(5000);
    expect(
      needsVisionOcr({
        text,
        pages: [{ page: 1, text }],
        pageCount: 2,
      }),
    ).toBe(false);
  });

  it('returns true when avg chars per page is low', () => {
    expect(
      needsVisionOcr({
        text: 'коротко',
        pages: [{ page: 1, text: 'коротко' }],
        pageCount: 10,
      }),
    ).toBe(true);
  });

  it('returns false when pageCount unknown but text is substantial', () => {
    const text = 'а'.repeat(200);
    expect(needsVisionOcr({ text, pages: [{ page: 1, text }], pageCount: 0 })).toBe(false);
  });
});

describe('isTextlessScanVersion', () => {
  it('detects a scan whose OCR failed', () => {
    expect(isTextlessScanVersion({ textSource: 'pdfjs', visionOcrStatus: 'failed' })).toBe(true);
  });

  it('detects a scan when OCR was skipped', () => {
    expect(isTextlessScanVersion({ textSource: 'pdfjs', visionOcrStatus: 'skipped' })).toBe(true);
  });

  it('never flags a text-layer pdf', () => {
    expect(
      isTextlessScanVersion({ textSource: 'pdfjs', visionOcrStatus: 'not_needed' }),
    ).toBe(false);
  });

  it('never flags a scan with recognized text', () => {
    expect(
      isTextlessScanVersion({ textSource: 'vision-ocr', visionOcrStatus: 'ready' }),
    ).toBe(false);
  });

  it('stays false while OCR is queued or processing', () => {
    expect(isTextlessScanVersion({ textSource: 'pdfjs', visionOcrStatus: 'queued' })).toBe(false);
    expect(
      isTextlessScanVersion({ textSource: 'pdfjs', visionOcrStatus: 'processing' }),
    ).toBe(false);
  });
});

describe('isVisionOcrInProgressStatus', () => {
  it('detects queued and processing', () => {
    expect(isVisionOcrInProgressStatus('queued')).toBe(true);
    expect(isVisionOcrInProgressStatus('processing')).toBe(true);
  });

  it('is false for terminal and absent statuses', () => {
    expect(isVisionOcrInProgressStatus('ready')).toBe(false);
    expect(isVisionOcrInProgressStatus('failed')).toBe(false);
    expect(isVisionOcrInProgressStatus('not_needed')).toBe(false);
    expect(isVisionOcrInProgressStatus(null)).toBe(false);
    expect(isVisionOcrInProgressStatus(undefined)).toBe(false);
  });
});

describe('isPdfTextLayerUnavailable', () => {
  it('is true while OCR is queued or processing', () => {
    expect(isPdfTextLayerUnavailable({ textSource: 'pdfjs', visionOcrStatus: 'queued' })).toBe(
      true,
    );
    expect(isPdfTextLayerUnavailable({ textSource: 'pdfjs', visionOcrStatus: 'processing' })).toBe(
      true,
    );
  });

  it('stays true after OCR, because the text is stored outside the pdf', () => {
    expect(isPdfTextLayerUnavailable({ textSource: 'vision-ocr', visionOcrStatus: 'ready' })).toBe(
      true,
    );
  });

  it('is true when OCR failed or was skipped', () => {
    expect(isPdfTextLayerUnavailable({ textSource: 'pdfjs', visionOcrStatus: 'failed' })).toBe(true);
    expect(isPdfTextLayerUnavailable({ textSource: 'pdfjs', visionOcrStatus: 'skipped' })).toBe(
      true,
    );
  });

  it('is false for a pdf with a text layer', () => {
    expect(isPdfTextLayerUnavailable({ textSource: 'pdfjs', visionOcrStatus: 'not_needed' })).toBe(
      false,
    );
  });

  it('does not block unknown legacy versions', () => {
    expect(isPdfTextLayerUnavailable({ textSource: null, visionOcrStatus: null })).toBe(false);
    expect(isPdfTextLayerUnavailable({})).toBe(false);
  });
});
