import { describe, expect, it, beforeEach } from 'vitest';
import {
  bookletTitleFieldsFromAi,
  EMPTY_BOOKLET_TITLE_FIELDS,
  loadBookletTitleDraft,
  saveBookletTitleDraft,
} from './booklet-title-draft.js';

describe('booklet-title-draft', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('round-trips fields in sessionStorage', () => {
    const fields = { title: 'Объект X', subtitle: 'Буклет', tagline: 'Стиль и свет' };
    saveBookletTitleDraft('doc-1', fields);
    expect(loadBookletTitleDraft('doc-1')).toEqual(fields);
  });

  it('returns null when nothing stored', () => {
    expect(loadBookletTitleDraft('doc-1')).toBeNull();
  });

  it('maps AI payload with defaults', () => {
    expect(bookletTitleFieldsFromAi({ title: '  Заголовок  ' })).toEqual({
      title: 'Заголовок',
      subtitle: 'Буклет',
      tagline: '',
    });
  });

  it('empty defaults are stable', () => {
    expect(EMPTY_BOOKLET_TITLE_FIELDS).toEqual({
      title: '',
      subtitle: '',
      tagline: '',
    });
  });
});
