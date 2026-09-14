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

  it('parses annotation event', () => {
    const event = parseDocumentVersionScopeEvent(
      JSON.stringify({
        type: 'annotation',
        documentId: 'doc-1',
        versionId: 'ver-1',
        action: 'created',
        annotationId: 'ann-1',
      }),
    );
    expect(event).toEqual({
      type: 'annotation',
      documentId: 'doc-1',
      versionId: 'ver-1',
      action: 'created',
      annotationId: 'ann-1',
    });
  });

  it('parses suggestion event', () => {
    const event = parseDocumentVersionScopeEvent(
      JSON.stringify({
        type: 'suggestion',
        documentId: 'doc-1',
        versionId: 'ver-1',
        action: 'accepted',
        suggestionId: 'sup-1',
      }),
    );
    expect(event).toEqual({
      type: 'suggestion',
      documentId: 'doc-1',
      versionId: 'ver-1',
      action: 'accepted',
      suggestionId: 'sup-1',
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

  it('parses member_access event', () => {
    const event = parseDocumentMetaScopeEvent(
      JSON.stringify({
        type: 'member_access',
        documentId: 'doc-1',
        userId: 'user-1',
        action: 'role_changed',
        role: 'commenter',
      }),
    );
    expect(event).toEqual({
      type: 'member_access',
      documentId: 'doc-1',
      userId: 'user-1',
      action: 'role_changed',
      role: 'commenter',
    });
  });

  it('parses share_link event', () => {
    const event = parseDocumentMetaScopeEvent(
      JSON.stringify({
        type: 'share_link',
        documentId: 'doc-1',
        action: 'created',
        linkId: 'link-1',
        versionId: 'ver-1',
      }),
    );
    expect(event).toEqual({
      type: 'share_link',
      documentId: 'doc-1',
      action: 'created',
      linkId: 'link-1',
      versionId: 'ver-1',
    });
  });
});
