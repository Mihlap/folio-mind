import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SHARE_LINK_TTL_PRESET,
  shareLinkTtlMs,
  SHARE_LINK_TTL_PRESET_IDS,
} from './share-link-ttl.js';

describe('share-link-ttl', () => {
  it('exposes all guest TTL presets', () => {
    expect(SHARE_LINK_TTL_PRESET_IDS).toEqual(['12h', '1d', '3d', '7d', '14d', '30d']);
  });

  it('defaults to 7 days', () => {
    expect(DEFAULT_SHARE_LINK_TTL_PRESET).toBe('7d');
    expect(shareLinkTtlMs('7d')).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('supports 12 hours', () => {
    expect(shareLinkTtlMs('12h')).toBe(12 * 60 * 60 * 1000);
  });
});
