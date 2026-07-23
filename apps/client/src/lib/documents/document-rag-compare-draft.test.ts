import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearDocumentRagCompareDraft,
  loadDocumentRagCompareDraft,
  saveDocumentRagCompareDraft,
} from './document-rag-compare-draft.js';

describe('document-rag-compare-draft', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('round-trips draft in sessionStorage', () => {
    saveDocumentRagCompareDraft('v1', {
      report: 'Совпадения: …',
      collapsed: true,
    });
    expect(loadDocumentRagCompareDraft('v1')).toEqual({
      report: 'Совпадения: …',
      collapsed: true,
    });
  });

  it('clears draft', () => {
    saveDocumentRagCompareDraft('v1', { report: 'x', collapsed: false });
    clearDocumentRagCompareDraft('v1');
    expect(loadDocumentRagCompareDraft('v1')).toBeNull();
  });

  it('rejects empty report', () => {
    sessionStorage.setItem('folio-document-rag-compare:v1', JSON.stringify({ report: '  ' }));
    expect(loadDocumentRagCompareDraft('v1')).toBeNull();
  });
});
