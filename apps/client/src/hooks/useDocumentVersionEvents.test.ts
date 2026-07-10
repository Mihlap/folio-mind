import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const fetchEventSourceMock = vi.fn();
const dispatchMock = vi.fn();

vi.mock('@microsoft/fetch-event-source', () => ({
  fetchEventSource: (...args: unknown[]) => fetchEventSourceMock(...args),
}));

vi.mock('./index.js', () => ({
  useAppDispatch: () => dispatchMock,
}));

vi.mock('@folio-mind/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@folio-mind/store')>();
  return {
    ...actual,
    apiBaseUrl: 'http://localhost:3001',
  };
});

import { useDocumentVersionEvents } from './useDocumentVersionEvents.js';

describe('useDocumentVersionEvents', () => {
  beforeEach(() => {
    fetchEventSourceMock.mockReset();
    dispatchMock.mockReset();
    fetchEventSourceMock.mockResolvedValue(undefined);
  });

  it('opens SSE when enabled', async () => {
    renderHook(() =>
      useDocumentVersionEvents({
        documentId: 'doc-1',
        versionId: 'ver-1',
        token: 'token-1',
        enabled: true,
      }),
    );

    await waitFor(() => {
      expect(fetchEventSourceMock).toHaveBeenCalledTimes(1);
    });

    const [url, options] = fetchEventSourceMock.mock.calls[0] as [
      string,
      { headers: Record<string, string> },
    ];
    expect(url).toBe('http://localhost:3001/documents/doc-1/versions/ver-1/events');
    expect(options.headers.Authorization).toBe('Bearer token-1');
  });

  it('does not open SSE when disabled', async () => {
    renderHook(() =>
      useDocumentVersionEvents({
        documentId: 'doc-1',
        versionId: 'ver-1',
        token: 'token-1',
        enabled: false,
      }),
    );

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetchEventSourceMock).not.toHaveBeenCalled();
  });
});
