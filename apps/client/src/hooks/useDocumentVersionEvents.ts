import { useEffect, useRef } from 'react';
import { apiBaseUrl, documentsApi, guestCommentsApi, pageReviewApi } from '@folio-mind/store';
import { connectEventSource, SseConnectionError } from './connectEventSource.js';
import { useAppDispatch } from './index.js';

type Options = {
  documentId: string | undefined;
  versionId: string | undefined;
  token: string | null;
  enabled: boolean;
};

export function useDocumentVersionEvents({
  documentId,
  versionId,
  token,
  enabled,
}: Options): void {
  const dispatch = useAppDispatch();
  const openedOnceRef = useRef(false);
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;

  useEffect(() => {
    openedOnceRef.current = false;
  }, [documentId, versionId]);

  useEffect(() => {
    if (!enabled || !documentId || !versionId || !token) return;

    const abort = new AbortController();
    const url = `${apiBaseUrl}/documents/${encodeURIComponent(documentId)}/versions/${encodeURIComponent(versionId)}/events`;

    const invalidateLiveData = () => {
      dispatchRef.current(
        guestCommentsApi.util.invalidateTags([{ type: 'GuestComments', id: versionId }]),
      );
      dispatchRef.current(
        pageReviewApi.util.invalidateTags([{ type: 'Documents', id: `page-marks-${versionId}` }]),
      );
      dispatchRef.current(documentsApi.util.invalidateTags([{ type: 'Documents', id: documentId }]));
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        invalidateLiveData();
      }
    };

    document.addEventListener('visibilitychange', onVisible);

    void connectEventSource({
      url,
      signal: abort.signal,
      headers: { Authorization: `Bearer ${token}` },
      onOpen: () => {
        if (openedOnceRef.current) {
          invalidateLiveData();
        }
        openedOnceRef.current = true;
      },
      onMessage: (message) => {
        if (
          message.event === 'guest_comment' ||
          message.event === 'page_review' ||
          message.event === 'review_status'
        ) {
          invalidateLiveData();
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
