import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearRegulationsSearchDraft,
  loadRegulationsSearchDraft,
  saveRegulationsSearchDraft,
} from './regulations-search-draft.js';

describe('regulations-search-draft', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('round-trips search results', () => {
    saveRegulationsSearchDraft({
      query: 'срок оплаты',
      hits: [
        {
          id: '1',
          sourceId: 's1',
          sourceTitle: 'Регламент',
          chunkIndex: 0,
          content: 'Оплата в течение 10 дней',
        },
      ],
      collapsed: false,
    });
    expect(loadRegulationsSearchDraft()?.query).toBe('срок оплаты');
    expect(loadRegulationsSearchDraft()?.hits).toHaveLength(1);
  });

  it('clears draft', () => {
    saveRegulationsSearchDraft({ query: 'x', hits: [], collapsed: true });
    clearRegulationsSearchDraft();
    expect(loadRegulationsSearchDraft()).toBeNull();
  });
});
