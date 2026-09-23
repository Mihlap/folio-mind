import { describe, expect, it } from 'vitest';
import { splitTextIntoChunks } from './split-text-chunks.js';

describe('splitTextIntoChunks', () => {
  it('returns empty for blank text', () => {
    expect(splitTextIntoChunks('')).toEqual([]);
    expect(splitTextIntoChunks('   \n\n  ')).toEqual([]);
  });

  it('keeps short text as one chunk', () => {
    expect(splitTextIntoChunks('короткий текст')).toEqual(['короткий текст']);
  });

  it('splits long paragraph with overlap', () => {
    const text = 'а'.repeat(2500);
    const chunks = splitTextIntoChunks(text, { maxChunkSize: 1000, overlap: 100 });
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks[0]!.length).toBeLessThanOrEqual(1000);

    const overlapProbe = chunks[0]!.slice(-80);
    expect(chunks[1]!.startsWith(overlapProbe.slice(0, 50))).toBe(true);
  });

  it('accepts legacy number maxChunkSize', () => {
    const text = `${'б'.repeat(500)}\n\n${'в'.repeat(500)}`;
    const chunks = splitTextIntoChunks(text, 400);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });
});
