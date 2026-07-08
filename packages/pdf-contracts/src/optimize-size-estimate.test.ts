import { describe, expect, it } from 'vitest';
import {
  estimateOptimizeSize,
  formatFileSize,
  formatOptimizeSizeRange,
} from './optimize-size-estimate.js';

describe('optimize-size-estimate', () => {
  it('formats bytes in Russian units', () => {
    expect(formatFileSize(512)).toBe('512 Б');
    expect(formatFileSize(2048)).toBe('2.0 КБ');
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 МБ');
  });

  it('returns null for invalid source size', () => {
    expect(estimateOptimizeSize(0, 10, 'email')).toBeNull();
  });

  it('estimates wider range for image-heavy PDFs', () => {
    const estimate = estimateOptimizeSize(20 * 1024 * 1024, 10, 'email');
    expect(estimate).not.toBeNull();
    expect(estimate!.likelyTextOnly).toBe(false);
    expect(estimate!.minBytes).toBeLessThan(estimate!.maxBytes);
    expect(estimate!.maxBytes).toBeLessThan(estimate!.sourceBytes);
  });

  it('estimates narrow range for text-only PDFs', () => {
    const estimate = estimateOptimizeSize(2 * 1024 * 1024, 40, 'email');
    expect(estimate).not.toBeNull();
    expect(estimate!.likelyTextOnly).toBe(true);
    expect(estimate!.minBytes).toBeGreaterThan(estimate!.sourceBytes * 0.85);
  });

  it('none preset keeps same size', () => {
    const estimate = estimateOptimizeSize(10 * 1024 * 1024, 5, 'none');
    expect(estimate!.minBytes).toBe(estimate!.sourceBytes);
    expect(estimate!.maxBytes).toBe(estimate!.sourceBytes);
    expect(formatOptimizeSizeRange(estimate!)).toBe('10.0 МБ');
  });
});
