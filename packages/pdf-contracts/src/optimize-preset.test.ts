import { describe, expect, it } from 'vitest';
import { isOptimizePreset, OPTIMIZE_PRESET_INFO } from './optimize-preset.js';

describe('optimize-preset', () => {
  it('validates preset ids', () => {
    expect(isOptimizePreset('email')).toBe(true);
    expect(isOptimizePreset('invalid')).toBe(false);
  });

  it('descriptions are plain language without tool names', () => {
    for (const preset of Object.values(OPTIMIZE_PRESET_INFO)) {
      const text = preset.description.toLowerCase();
      expect(text).not.toMatch(/qpdf|ghostscript|jpeg|\/printer/);
      expect(preset.description.length).toBeGreaterThan(10);
    }
  });
});
