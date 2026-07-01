import { describe, expect, it } from 'vitest';
import {
  clampLayoutRect,
  computeLayoutImageDrawParams,
  layoutRectToPx,
  layoutStepFraction,
  pdfPointsToMm,
  rotateLayoutObject,
  snapLayoutRect,
} from './layout-editor.js';

describe('layout-editor', () => {
  it('converts PDF points to mm', () => {
    expect(pdfPointsToMm(72)).toBeCloseTo(25.4, 1);
  });

  it('clamps rect inside page', () => {
    const rect = clampLayoutRect({ x: 0.9, y: 0.9, width: 0.5, height: 0.5 });
    expect(rect.x + rect.width).toBeLessThanOrEqual(1);
    expect(rect.y + rect.height).toBeLessThanOrEqual(1);
  });

  it('snaps to grid step', () => {
    const rect = snapLayoutRect({ x: 0.13, y: 0.27, width: 0.31, height: 0.22 }, 0.1);
    expect(rect.x).toBeCloseTo(0.1, 5);
    expect(rect.y).toBeCloseTo(0.3, 5);
  });

  it('maps layout rect to pixels', () => {
    const px = layoutRectToPx({ x: 0.1, y: 0.2, width: 0.5, height: 0.3 }, 1000, 800);
    expect(px).toEqual({ left: 100, top: 160, width: 500, height: 240 });
  });

  it('computes step fraction from mm grid', () => {
    expect(layoutStepFraction(10, 210)).toBeCloseTo(10 / 210, 5);
  });

  it('computeLayoutImageDrawParams rotates around center', () => {
    const rect = { x: 0.25, y: 0.25, width: 0.5, height: 0.25 };
    const base = computeLayoutImageDrawParams(rect, 200, 400, 0);
    const rotated = computeLayoutImageDrawParams(rect, 200, 400, 90);
    expect(base.rotationDeg).toBe(0);
    expect(rotated.rotationDeg).toBe(90);
    expect(rotated.x).not.toBeCloseTo(base.x, 0);
  });

  it('rotateLayoutObject normalizes degrees', () => {
    const object = {
      id: '1',
      page: 1,
      imageSrc: 'x',
      rotation: 270,
      rect: { x: 0, y: 0, width: 0.2, height: 0.2 },
    };
    expect(rotateLayoutObject(object, 90).rotation).toBe(0);
  });
});
