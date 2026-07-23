import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearDocumentExtractDraft,
  loadDocumentExtractDraft,
  saveDocumentExtractDraft,
} from './document-extract-draft.js';

describe('document-extract-draft', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('round-trips draft in sessionStorage', () => {
    saveDocumentExtractDraft('v1', {
      extracted: { place: 'Мурманск' },
      templateTitle: 'Договор',
      templateId: 'contract',
      viewFormat: 'fields',
      collapsed: true,
    });
    expect(loadDocumentExtractDraft('v1')).toEqual({
      extracted: { place: 'Мурманск' },
      templateTitle: 'Договор',
      templateId: 'contract',
      viewFormat: 'fields',
      collapsed: true,
    });
  });

  it('clears draft', () => {
    saveDocumentExtractDraft('v1', {
      extracted: { a: 1 },
      templateTitle: null,
      templateId: null,
      viewFormat: 'json',
      collapsed: false,
    });
    clearDocumentExtractDraft('v1');
    expect(loadDocumentExtractDraft('v1')).toBeNull();
  });
});
