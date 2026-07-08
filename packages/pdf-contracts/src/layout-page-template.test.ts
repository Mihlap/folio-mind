import { describe, expect, it } from 'vitest';
import {
  layoutGuidesForPreset,
  layoutGuidesFromMargins,
  normalizeLayoutCrop,
} from './layout-page-template.js';

describe('layout-page-template', () => {
  it('builds safe and bleed guides from mm margins', () => {
    const guides = layoutGuidesFromMargins(
      210,
      297,
      { top: 15, right: 15, bottom: 15, left: 15 },
      3,
    );
    expect(guides.safe.x).toBeCloseTo(15 / 210, 4);
    expect(guides.safe.y).toBeCloseTo(15 / 297, 4);
    expect(guides.bleed.x).toBeCloseTo(3 / 210, 4);
  });

  it('returns null guides for none preset', () => {
    expect(layoutGuidesForPreset(210, 297, 'none')).toBeNull();
  });

  it('normalizes crop to full frame by default', () => {
    expect(normalizeLayoutCrop()).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });
});
