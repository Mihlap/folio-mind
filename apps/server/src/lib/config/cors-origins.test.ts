import { describe, expect, it } from 'vitest';
import { parseCorsOrigins } from './cors-origins.js';

describe('parseCorsOrigins', () => {
  it('returns single origin as string', () => {
    expect(parseCorsOrigins('http://localhost:5173')).toBe('http://localhost:5173');
  });

  it('splits comma-separated list', () => {
    expect(parseCorsOrigins('http://localhost:5173, https://localhost')).toEqual([
      'http://localhost:5173',
      'https://localhost',
    ]);
  });
});
