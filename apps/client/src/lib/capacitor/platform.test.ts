import { describe, expect, it } from 'vitest';
import { isNativeApp, nativePlatform } from './platform.js';

describe('capacitor platform helpers', () => {
  it('reports web in vitest/jsdom', () => {
    expect(isNativeApp()).toBe(false);
    expect(nativePlatform()).toBe('web');
  });
});
