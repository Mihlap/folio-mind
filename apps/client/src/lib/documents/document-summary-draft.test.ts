import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearDocumentSummaryDraft,
  loadDocumentSummaryDraft,
  saveDocumentSummaryDraft,
} from './document-summary-draft.js';

describe('document-summary-draft', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('round-trips draft in sessionStorage', () => {
    saveDocumentSummaryDraft('v1', {
      summary: 'Кратко: стороны договорились…',
      collapsed: true,
    });
    expect(loadDocumentSummaryDraft('v1')).toEqual({
      summary: 'Кратко: стороны договорились…',
      collapsed: true,
    });
  });

  it('clears draft', () => {
    saveDocumentSummaryDraft('v1', { summary: 'x', collapsed: false });
    clearDocumentSummaryDraft('v1');
    expect(loadDocumentSummaryDraft('v1')).toBeNull();
  });

  it('rejects empty summary', () => {
    sessionStorage.setItem('folio-document-summary:v1', JSON.stringify({ summary: '  ' }));
    expect(loadDocumentSummaryDraft('v1')).toBeNull();
  });
});
