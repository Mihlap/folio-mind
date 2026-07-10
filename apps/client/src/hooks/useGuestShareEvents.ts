import { useEffect, useRef } from 'react';
import { apiBaseUrl } from '@folio-mind/store';
import { connectEventSource, SseConnectionError } from './connectEventSource.js';

type Options = {
  token: string | undefined;
  sharePassword?: string | null;
  enabled: boolean;
  onGuestComment?: () => void;
  onPageReview?: () => void;
};

export function useGuestShareEvents({
  token,
  sharePassword,
  enabled,
  onGuestComment,
  onPageReview,
}: Options): void {
  const openedOnceRef = useRef(false);
  const onGuestCommentRef = useRef(onGuestComment);
  const onPageReviewRef = useRef(onPageReview);

  useEffect(() => {
    onGuestCommentRef.current = onGuestComment;
    onPageReviewRef.current = onPageReview;
  }, [onGuestComment, onPageReview]);

  useEffect(() => {
    openedOnceRef.current = false;
  }, [token, sharePassword]);

  useEffect(() => {
    if (!enabled || !token) return;

    const abort = new AbortController();
    const url = `${apiBaseUrl}/public/share/${encodeURIComponent(token)}/events`;
    const headers: Record<string, string> = {};
    if (sharePassword) {
      headers['X-Folio-Share-Password'] = sharePassword;
    }

    const syncAll = () => {
      onGuestCommentRef.current?.();
      onPageReviewRef.current?.();
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        syncAll();
      }
    };

    document.addEventListener('visibilitychange', onVisible);

    void connectEventSource({
      url,
      signal: abort.signal,
      headers,
      onOpen: () => {
        if (openedOnceRef.current) {
          syncAll();
        }
        openedOnceRef.current = true;
      },
      onMessage: (message) => {
        if (message.event === 'guest_comment') {
          onGuestCommentRef.current?.();
        }
        if (message.event === 'page_review') {
          onPageReviewRef.current?.();
        }
      },
    }).catch((error: unknown) => {
      if (abort.signal.aborted) return;
      if (error instanceof SseConnectionError && error.fatal) return;
      console.warn('[guest-share-events] SSE connection failed', error);
    });

    return () => {
      abort.abort();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, sharePassword, token]);
}
