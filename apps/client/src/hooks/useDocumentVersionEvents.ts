import { useEffect, useRef } from 'react';
import {
  apiBaseUrl,
  annotationsApi,
  aiApi,
  documentMembersApi,
  documentsApi,
  guestCommentsApi,
  pageReviewApi,
  shareApi,
} from '@folio-mind/store';
import { readUserIdFromAuthToken } from '../lib/documents/document-ui-permissions.js';
import { connectEventSource, SseConnectionError } from './connectEventSource.js';
import { useAppDispatch } from './index.js';

type MemberAccessEventData = {
  userId?: string;
};

type Options = {
  documentId: string | undefined;
  versionId: string | undefined;
  token: string | null;
  currentUserId?: string | null;
  enabled: boolean;
};

export function useDocumentVersionEvents({
  documentId,
  versionId,
  token,
  currentUserId,
  enabled,
}: Options): void {
  const dispatch = useAppDispatch();
  const openedOnceRef = useRef(false);
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;
  const currentUserIdRef = useRef(currentUserId ?? readUserIdFromAuthToken(token));
  currentUserIdRef.current = currentUserId ?? readUserIdFromAuthToken(token);

  useEffect(() => {
    openedOnceRef.current = false;
  }, [documentId, versionId]);

  useEffect(() => {
    if (!enabled || !documentId || !versionId || !token) return;

    const abort = new AbortController();
    const url = `${apiBaseUrl}/documents/${encodeURIComponent(documentId)}/versions/${encodeURIComponent(versionId)}/events`;

    const invalidateCollaborationData = () => {
      dispatchRef.current(
        guestCommentsApi.util.invalidateTags([{ type: 'GuestComments', id: versionId }]),
      );
      dispatchRef.current(
        pageReviewApi.util.invalidateTags([{ type: 'Documents', id: `page-marks-${versionId}` }]),
      );
    };

    const invalidateAnnotationsData = () => {
      dispatchRef.current(
        annotationsApi.util.invalidateTags([{ type: 'Annotations', id: versionId }]),
      );
      dispatchRef.current(
        aiApi.util.invalidateTags([{ type: 'AiSuggestions', id: versionId }]),
      );
    };

    const invalidateAiSuggestions = () => {
      dispatchRef.current(
        aiApi.util.invalidateTags([{ type: 'AiSuggestions', id: versionId }]),
      );
    };

    const invalidateShareLinks = () => {
      dispatchRef.current(
        shareApi.util.invalidateTags([{ type: 'ShareLinks', id: documentId }]),
      );
    };

    const invalidateDocumentMeta = () => {
      dispatchRef.current(documentsApi.util.invalidateTags([{ type: 'Documents', id: documentId }]));
    };

    const invalidateMemberAccessForCurrentUser = () => {
      dispatchRef.current(documentsApi.util.invalidateTags([{ type: 'Documents', id: documentId }]));
      dispatchRef.current(
        documentMembersApi.util.invalidateTags([{ type: 'DocumentMembers', id: documentId }]),
      );
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        invalidateCollaborationData();
      }
    };

    document.addEventListener('visibilitychange', onVisible);

    void connectEventSource({
      url,
      signal: abort.signal,
      headers: { Authorization: `Bearer ${token}` },
      onOpen: () => {
        if (openedOnceRef.current) {
          invalidateCollaborationData();
        }
        openedOnceRef.current = true;
      },
      onMessage: (message) => {
        if (message.event === 'member_access') {
          let affectedUserId: string | null = null;
          try {
            const data = JSON.parse(message.data) as MemberAccessEventData;
            affectedUserId = typeof data.userId === 'string' ? data.userId : null;
          } catch {
            affectedUserId = null;
          }
          if (affectedUserId && affectedUserId === currentUserIdRef.current) {
            invalidateMemberAccessForCurrentUser();
          }
          return;
        }

        if (
          message.event === 'guest_comment' ||
          message.event === 'page_review'
        ) {
          invalidateCollaborationData();
          return;
        }

        if (message.event === 'annotation') {
          invalidateAnnotationsData();
          return;
        }

        if (message.event === 'suggestion') {
          invalidateAiSuggestions();
          return;
        }

        if (message.event === 'review_status') {
          invalidateDocumentMeta();
          return;
        }

        if (message.event === 'version_created') {
          invalidateDocumentMeta();
          return;
        }

        if (message.event === 'version_deleted') {
          invalidateDocumentMeta();
          return;
        }

        if (message.event === 'share_link') {
          invalidateShareLinks();
          return;
        }
      },
    }).catch((error: unknown) => {
      if (abort.signal.aborted) return;
      if (error instanceof SseConnectionError && error.fatal) return;
      console.warn('[document-events] SSE connection failed', error);
    });

    return () => {
      abort.abort();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [documentId, enabled, token, versionId]);
}
