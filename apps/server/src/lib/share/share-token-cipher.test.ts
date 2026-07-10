import { describe, expect, it } from 'vitest';
import { decryptShareToken, encryptShareToken } from './share-token-cipher.js';

describe('share-token-cipher', () => {
  it('encrypts and decrypts share token', () => {
    const token = 'abc123sharetoken';
    const cipher = encryptShareToken(token, 'secret-key');
    expect(cipher).not.toContain(token);
    expect(decryptShareToken(cipher, 'secret-key')).toBe(token);
  });

  it('returns null for tampered payload', () => {
    const cipher = encryptShareToken('token', 'secret-key');
    expect(decryptShareToken(cipher.slice(0, -4), 'secret-key')).toBeNull();
    expect(decryptShareToken(cipher, 'other-secret')).toBeNull();
  });
});
