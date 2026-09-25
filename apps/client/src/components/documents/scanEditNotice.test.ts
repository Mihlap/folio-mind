import { describe, expect, it } from 'vitest';
import { scanEditNotice } from './scanEditNotice.js';

describe('scanEditNotice', () => {
  it('returns nothing when the PDF has a text layer', () => {
    expect(scanEditNotice({ visionOcrStatus: 'not_needed', hasSourceDocx: false })).toBeNull();
    expect(scanEditNotice({ visionOcrStatus: null, hasSourceDocx: false })).toBeNull();
    expect(scanEditNotice({ visionOcrStatus: undefined, hasSourceDocx: true })).toBeNull();
  });

  it('warns about text selection while OCR is running', () => {
    const notice = scanEditNotice({ visionOcrStatus: 'processing', hasSourceDocx: false });
    expect(notice?.level).toBe('pending');
    expect(notice?.blocksTextSelection).toBe(true);
    expect(notice?.blocksTextEdits).toBe(false);
  });

  it('blocks text edits when a scan has no OCR and no source docx', () => {
    for (const status of ['failed', 'skipped']) {
      const notice = scanEditNotice({ visionOcrStatus: status, hasSourceDocx: false });
      expect(notice?.level).toBe('warning');
      expect(notice?.blocksTextEdits).toBe(true);
      expect(notice?.title).toBe('Файл читается как скан');
    }
  });

  it('keeps text edits available when a source docx can be edited instead', () => {
    const notice = scanEditNotice({ visionOcrStatus: 'skipped', hasSourceDocx: true });
    expect(notice?.level).toBe('info');
    expect(notice?.blocksTextEdits).toBe(false);
    expect(notice?.description).toContain('DOCX');
  });

  it('explains that ready OCR helps chat but not PDF text edits', () => {
    const notice = scanEditNotice({
      visionOcrStatus: 'ready',
      textSource: 'vision-ocr',
      hasSourceDocx: false,
    });
    expect(notice?.level).toBe('info');
    expect(notice?.blocksTextEdits).toBe(false);
    expect(notice?.description).toContain('текстового слоя');
  });

  it('ignores ready status for non-OCR text sources', () => {
    expect(
      scanEditNotice({ visionOcrStatus: 'ready', textSource: 'pdfjs', hasSourceDocx: false }),
    ).toBeNull();
  });
});
