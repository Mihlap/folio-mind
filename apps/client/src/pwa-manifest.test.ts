import { describe, expect, it } from 'vitest';
import { pwaManifest } from './pwa-manifest.js';

describe('pwaManifest', () => {
  it('has required installable fields', () => {
    expect(pwaManifest.name.length).toBeGreaterThan(0);
    expect(pwaManifest.short_name.length).toBeGreaterThan(0);
    expect(pwaManifest.display).toBe('standalone');
    expect(pwaManifest.start_url).toBe('/');
    expect(pwaManifest.icons.some((icon) => icon.sizes === '192x192')).toBe(true);
    expect(pwaManifest.icons.some((icon) => icon.sizes === '512x512')).toBe(true);
  });
});
