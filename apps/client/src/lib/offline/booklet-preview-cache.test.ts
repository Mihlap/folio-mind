import { describe, expect, it } from 'vitest';
import { OFFLINE_BOOKLET_MAX_PAGES, selectPagesForOfflineCache } from './booklet-preview-cache.js';

describe('selectPagesForOfflineCache', () => {
  it('keeps first N pages with urls, sorted', () => {
    const pages = [
      { page: 3, url: 'https://a/3' },
      { page: 1, url: 'https://a/1' },
      { page: 2, url: '' },
      { page: 4, url: 'https://a/4' },
    ];
    expect(selectPagesForOfflineCache(pages, 2)).toEqual([
      { page: 1, url: 'https://a/1' },
      { page: 3, url: 'https://a/3' },
    ]);
  });

  it('defaults to OFFLINE_BOOKLET_MAX_PAGES', () => {
    const pages = Array.from({ length: 40 }, (_, i) => ({
      page: i + 1,
      url: `u${i + 1}`,
    }));
    expect(selectPagesForOfflineCache(pages)).toHaveLength(OFFLINE_BOOKLET_MAX_PAGES);
  });
});
