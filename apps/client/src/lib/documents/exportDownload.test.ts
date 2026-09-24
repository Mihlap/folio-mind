import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatConvertFailure, openDownloadUrl } from './exportDownload.js';

describe('formatConvertFailure', () => {
  it('returns headline with advice when detail is missing', () => {
    const message = formatConvertFailure(undefined);
    expect(message.startsWith('Не удалось сконвертировать файл в DOCX.')).toBe(true);
    expect(message).toContain('загрузите исходный DOCX Word');
  });

  it('keeps short russian detail after headline', () => {
    const message = formatConvertFailure('PDF→DOCX: соединение оборвано при конвертации');
    expect(message.startsWith('Не удалось сконвертировать файл в DOCX.')).toBe(true);
    expect(message).toContain('соединение оборвано');
  });

  it('truncates long detail', () => {
    const detail = `Причина: ${'о'.repeat(300)}`;
    const message = formatConvertFailure(detail);
    expect(message.length).toBeLessThan(200);
    expect(message.endsWith('…')).toBe(true);
  });
});

describe('openDownloadUrl', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('opens a new tab when popup is allowed', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue({} as Window);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    openDownloadUrl('https://example.com/file.docx');
    expect(open).toHaveBeenCalledWith('https://example.com/file.docx', '_blank');
    expect(click).not.toHaveBeenCalled();
  });

  it('falls back to anchor click when popup is blocked', () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    openDownloadUrl('https://example.com/file.docx');
    expect(click).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll('a')).toHaveLength(0);
  });
});
