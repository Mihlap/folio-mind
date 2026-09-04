import type { DocumentReviewStatus } from './document-review-status.js';

export const DOCUMENT_EVENTS_CHANNEL_PREFIX = 'folio:doc-events';
export const DOCUMENT_META_CHANNEL_SUFFIX = '_meta';

export type GuestCommentEventAction = 'created' | 'updated' | 'deleted' | 'cleared';
export type PageReviewEventAction = 'updated' | 'cleared';

export type GuestCommentDocumentEvent = {
  type: 'guest_comment';
  documentId: string;
  versionId: string;
  action: GuestCommentEventAction;
  commentId?: string;
};

export type PageReviewDocumentEvent = {
  type: 'page_review';
  documentId: string;
  versionId: string;
  action: PageReviewEventAction;
  page?: number;
};

export type ReviewStatusDocumentEvent = {
  type: 'review_status';
  documentId: string;
  reviewStatus: DocumentReviewStatus;
};

export type MemberAccessEventAction = 'added' | 'role_changed' | 'removed';

export type MemberAccessDocumentEvent = {
  type: 'member_access';
  documentId: string;
  userId: string;
  action: MemberAccessEventAction;
  role?: string;
};

export type VersionCreatedDocumentEvent = {
  type: 'version_created';
  documentId: string;
  versionId: string;
  version: number;
};

export type VersionDeletedDocumentEvent = {
  type: 'version_deleted';
  documentId: string;
  versionId: string;
};

export type DocumentVersionScopeEvent = GuestCommentDocumentEvent | PageReviewDocumentEvent;
export type DocumentMetaScopeEvent = ReviewStatusDocumentEvent | MemberAccessDocumentEvent | VersionCreatedDocumentEvent | VersionDeletedDocumentEvent;
export type DocumentScopeEvent = DocumentVersionScopeEvent | DocumentMetaScopeEvent;

/** @deprecated Use DocumentVersionScopeEvent */
export type DocumentVersionEvent = DocumentVersionScopeEvent;

export function documentVersionEventsChannel(documentId: string, versionId: string): string {
  return `${DOCUMENT_EVENTS_CHANNEL_PREFIX}:${documentId}:${versionId}`;
}

export function documentMetaEventsChannel(documentId: string): string {
  return `${DOCUMENT_EVENTS_CHANNEL_PREFIX}:${documentId}:${DOCUMENT_META_CHANNEL_SUFFIX}`;
}

function isGuestCommentEvent(
  parsed: DocumentScopeEvent,
): parsed is GuestCommentDocumentEvent {
  if (parsed.type !== 'guest_comment') return false;
  if (typeof parsed.documentId !== 'string' || typeof parsed.versionId !== 'string') return false;
  return (
    parsed.action === 'created' ||
    parsed.action === 'updated' ||
    parsed.action === 'deleted' ||
    parsed.action === 'cleared'
  );
}

function isPageReviewEvent(parsed: DocumentScopeEvent): parsed is PageReviewDocumentEvent {
  if (parsed.type !== 'page_review') return false;
  if (typeof parsed.documentId !== 'string' || typeof parsed.versionId !== 'string') return false;
  return parsed.action === 'updated' || parsed.action === 'cleared';
}

function isReviewStatusEvent(parsed: DocumentScopeEvent): parsed is ReviewStatusDocumentEvent {
  return parsed.type === 'review_status' && typeof parsed.documentId === 'string';
}

function isMemberAccessEvent(parsed: DocumentScopeEvent): parsed is MemberAccessDocumentEvent {
  if (parsed.type !== 'member_access') return false;
  if (typeof parsed.documentId !== 'string' || typeof parsed.userId !== 'string') return false;
  return (
    parsed.action === 'added' ||
    parsed.action === 'role_changed' ||
    parsed.action === 'removed'
  );
}

function isVersionCreatedEvent(parsed: DocumentScopeEvent): parsed is VersionCreatedDocumentEvent {
  if (parsed.type !== 'version_created') return false;
  if (typeof parsed.documentId !== 'string' || typeof parsed.versionId !== 'string') return false;
  return typeof parsed.version === 'number';
}

function isVersionDeletedEvent(parsed: DocumentScopeEvent): parsed is VersionDeletedDocumentEvent {
  if (parsed.type !== 'version_deleted') return false;
  return typeof parsed.documentId === 'string' && typeof parsed.versionId === 'string';
}

export function parseDocumentVersionScopeEvent(raw: string): DocumentVersionScopeEvent | null {
  try {
    const parsed = JSON.parse(raw) as DocumentScopeEvent;
    if (isGuestCommentEvent(parsed) || isPageReviewEvent(parsed)) return parsed;
    return null;
  } catch {
    return null;
  }
}

export function parseDocumentMetaScopeEvent(raw: string): DocumentMetaScopeEvent | null {
  try {
    const parsed = JSON.parse(raw) as DocumentScopeEvent;
    if (isReviewStatusEvent(parsed) || isMemberAccessEvent(parsed) || isVersionCreatedEvent(parsed) || isVersionDeletedEvent(parsed)) return parsed;
    return null;
  } catch {
    return null;
  }
}

export function parseDocumentVersionEvent(raw: string): DocumentVersionScopeEvent | null {
  return parseDocumentVersionScopeEvent(raw);
}
