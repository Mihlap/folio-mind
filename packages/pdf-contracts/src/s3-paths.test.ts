import { describe, expect, it } from 'vitest';
import { assertS3KeyUnderFilesRoot, resolveS3Key } from './s3-paths.js';
describe('s3-paths', () => {
  it('resolves originals under folioFiles', () => {
    expect(resolveS3Key('originals', 'tenant/doc.pdf')).toBe('folioFiles/originals/tenant/doc.pdf');
  });
  it('rejects keys outside folioFiles', () => {
    expect(() => assertS3KeyUnderFilesRoot('originals/x.pdf')).toThrow(/folioFiles/);
    expect(() => assertS3KeyUnderFilesRoot('folioFiles/originals/x.pdf')).not.toThrow();
  });
});
