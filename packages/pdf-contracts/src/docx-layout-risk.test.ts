import { describe, expect, it } from 'vitest';
import { classifyDocxLayoutRisk } from './docx-layout-risk.js';
describe('docx-layout-risk', () => {
  it('flags image-first PDFs as images', () => {
    expect(classifyDocxLayoutRisk({ textChars: 0, drawings: 40, type3Runs: 0, totalRuns: 0 })).toBe('images');
    expect(classifyDocxLayoutRisk({ textChars: 120, drawings: 40, type3Runs: 2, totalRuns: 40 })).toBe('images');
  });
  it('flags deck with many pictures as deck', () => {
    expect(
      classifyDocxLayoutRisk({ textChars: 4204, drawings: 42, type3Runs: 267, totalRuns: 267 }),
    ).toBe('deck');
  });
  it('reports mixed when both signals present', () => {
    expect(
      classifyDocxLayoutRisk({ textChars: 120, drawings: 40, type3Runs: 40, totalRuns: 40 }),
    ).toBe('mixed');
  });
  it('returns null for a normal text document', () => {
    expect(classifyDocxLayoutRisk({ textChars: 20000, drawings: 0, type3Runs: 0, totalRuns: 50 })).toBeNull();
  });
});