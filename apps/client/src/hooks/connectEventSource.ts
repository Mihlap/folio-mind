import { fetchEventSource, type EventSourceMessage } from '@microsoft/fetch-event-source';

const MAX_SSE_RETRIES = 8;
const SSE_RETRY_BASE_MS = 3_000;
const SSE_RETRY_MAX_MS = 30_000;

export class SseConnectionError extends Error {
  readonly fatal: boolean;

  constructor(message: string, fatal = false) {
    super(message);
    this.name = 'SseConnectionError';
    this.fatal = fatal;
  }
}

type ConnectEventSourceOptions = {
  url: string;
  headers?: Record<string, string>;
  signal: AbortSignal;
  onOpen?: () => void;
  onMessage: (message: EventSourceMessage) => void;
};

export async function connectEventSource({
  url,
  headers,
  signal,
  onOpen,
  onMessage,
}: ConnectEventSourceOptions): Promise<void> {
  let retries = 0;

  await fetchEventSource(url, {
    signal,
    headers: {
      Accept: 'text/event-stream',
      ...headers,
    },
    openWhenHidden: true,
    async onopen(response) {
      if (response.ok) {
        retries = 0;
        onOpen?.();
        return;
      }
      if (response.status === 401 || response.status === 403 || response.status === 404) {
        throw new SseConnectionError(`SSE rejected: ${response.status}`, true);
      }
      if (response.status === 429 || response.status === 503) {
        throw new SseConnectionError(`SSE unavailable: ${response.status}`, true);
      }
      throw new SseConnectionError(`SSE unavailable: ${response.status}`);
    },
    onmessage: onMessage,
    onerror(error) {
      if (signal.aborted) {
        throw error;
      }
      if (error instanceof SseConnectionError && error.fatal) {
        throw error;
      }
      retries += 1;
      if (retries > MAX_SSE_RETRIES) {
        throw error instanceof Error ? error : new SseConnectionError('SSE retries exhausted', true);
      }
      return Math.min(SSE_RETRY_MAX_MS, SSE_RETRY_BASE_MS * retries);
    },
  });
}
