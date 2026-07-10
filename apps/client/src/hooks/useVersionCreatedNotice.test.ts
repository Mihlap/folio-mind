import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVersionCreatedNotice } from './useVersionCreatedNotice.js';
import type { DocumentVersionItem } from '../components/documents/DocumentVersionsPanel.js';

function version(id: string, n: number): DocumentVersionItem {
  return {
    id,
    version: n,
    versionLabel: null,
    status: 'ready',
    size: '1000',
    mimeType: 'application/pdf',
    pageCount: 1,
    createdAt: '2026-07-10T00:00:00.000Z',
  };
}

describe('useVersionCreatedNotice', () => {
  it('does not emit notice on initial versions load', () => {
    const { result, rerender } = renderHook(
      ({ versions, activeId }) => useVersionCreatedNotice(versions, activeId),
      {
        initialProps: {
          versions: [version('v1', 1)],
          activeId: 'v1',
        },
      },
    );
    expect(result.current.notice).toBeNull();

    rerender({ versions: [version('v1', 1)], activeId: 'v1' });
    expect(result.current.notice).toBeNull();
  });

  it('emits notice when a new version appears and becomes active', () => {
    const { result, rerender } = renderHook(
      ({ versions, activeId }) => useVersionCreatedNotice(versions, activeId),
      {
        initialProps: {
          versions: [version('v2', 2), version('v1', 1)],
          activeId: 'v1',
        },
      },
    );

    rerender({
      versions: [version('v3', 3), version('v2', 2), version('v1', 1)],
      activeId: 'v3',
    });

    expect(result.current.notice).toEqual({
      versionId: 'v3',
      versionNumber: 3,
      previousVersionId: 'v1',
      previousVersionNumber: 1,
    });

    act(() => result.current.dismissNotice());
    expect(result.current.notice).toBeNull();
  });
});
