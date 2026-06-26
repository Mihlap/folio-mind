import { describe, expect, it } from 'vitest';
import { isDocxBuffer, isUserUploadedSourceDocxKey } from './docx.js';
import { getRootVersionFromChain, getVersionChain } from './version-lineage.js';
describe('isDocxBuffer', () => {
  it('detects ZIP magic', () => {
    expect(isDocxBuffer(Buffer.from([0x50, 0x4b, 0x03, 0x04]))).toBe(true);
    expect(isDocxBuffer(Buffer.from('%PDF'))).toBe(false);
  });
});
describe('isUserUploadedSourceDocxKey', () => {
  it('distinguishes originals from processing cache', () => {
    expect(isUserUploadedSourceDocxKey('folioFiles/originals/doc/v1/file.docx')).toBe(true);
    expect(isUserUploadedSourceDocxKey('folioFiles/processing/doc/v1/pre-converted.docx')).toBe(
      false,
    );
  });
});
describe('getVersionChain', () => {
  it('walks sourceVersionId to root', () => {
    const versions = [
      { id: 'v3', sourceVersionId: 'v2' },
      { id: 'v2', sourceVersionId: 'v1' },
      { id: 'v1', sourceVersionId: null },
    ];
    const chain = getVersionChain(versions, 'v3');
    expect(chain.map((v) => v.id)).toEqual(['v3', 'v2', 'v1']);
    expect(getRootVersionFromChain(chain)?.id).toBe('v1');
  });
});
