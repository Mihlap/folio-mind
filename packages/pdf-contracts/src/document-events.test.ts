import { describe, expect, it } from 'vitest';
import {
  documentMetaEventsChannel,
  documentVersionEventsChannel,
  parseDocumentMetaScopeEvent,
  parseDocumentVersionScopeEvent,
} from './document-events.js';

describe('documentVersionEventsChannel', () => {
  it('builds stable redis channel key', () => {
    expect(documentVersionEventsChannel('doc-1', 'ver-1')).toBe('folio:doc-events:doc-1:ver-1');
  });
});

describe('documentMetaEventsChannel', () => {
  it('builds document meta channel key', () => {
    expect(documentMetaEventsChannel('doc-1')).toBe('folio:doc-events:doc-1:_meta');
  });
});

describe('parseDocumentVersionScopeEvent', () => {
  it('parses guest_comment event', () => {
    const event = parseDocumentVersionScopeEvent(
      JSON.stringify({
        type: 'guest_comment',
        documentId: 'doc-1',
        versionId: 'ver-1',
        action: 'created',
        commentId: 'cmt-1',
      }),
    );
    expect(event).toEqual({
      type: 'guest_comment',
      documentId: 'doc-1',
      versionId: 'ver-1',
      action: 'created',
      commentId: 'cmt-1',
    });
  });

  it('parses page_review event', () => {
    const event = parseDocumentVersionScopeEvent(
      JSON.stringify({
        type: 'page_review',
        documentId: 'doc-1',
        versionId: 'ver-1',
        action: 'updated',
        page: 3,
      }),
    );
    expect(event).toEqual({
      type: 'page_review',
      documentId: 'doc-1',
      versionId: 'ver-1',
      action: 'updated',
      page: 3,
    });
  });

  it('returns null for invalid payload', () => {
    expect(parseDocumentVersionScopeEvent('not-json')).toBeNull();
    expect(parseDocumentVersionScopeEvent(JSON.stringify({ type: 'other' }))).toBeNull();
    expect(
      parseDocumentVersionScopeEvent(
        JSON.stringify({ type: 'guest_comment', documentId: 'd', versionId: 'v', action: 'noop' }),
      ),
    ).toBeNull();
  });
});

describe('parseDocumentMetaScopeEvent', () => {
  it('parses review_status event', () => {
    const event = parseDocumentMetaScopeEvent(
      JSON.stringify({
        type: 'review_status',
        documentId: 'doc-1',
        reviewStatus: 'in_review',
      }),
    );
    expect(event).toEqual({
      type: 'review_status',
      documentId: 'doc-1',
      reviewStatus: 'in_review',
    });
  });
});
