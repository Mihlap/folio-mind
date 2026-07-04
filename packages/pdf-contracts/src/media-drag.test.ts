import { describe, expect, it } from 'vitest';
import { FOLIO_MEDIA_DRAG_MIME, parseFolioMediaDragPayload } from './media-drag.js';

describe('media-drag', () => {
  it('parses valid payload', () => {
    const raw = JSON.stringify({ assetId: 'asset-1', title: 'Photo' });
    expect(parseFolioMediaDragPayload(raw)).toEqual({ assetId: 'asset-1', title: 'Photo' });
  });

  it('rejects invalid payload', () => {
    expect(parseFolioMediaDragPayload('')).toBeNull();
    expect(parseFolioMediaDragPayload('{}')).toBeNull();
    expect(parseFolioMediaDragPayload('not-json')).toBeNull();
  });

  it('exports stable mime type', () => {
    expect(FOLIO_MEDIA_DRAG_MIME).toBe('application/x-folio-media-asset');
  });
});
