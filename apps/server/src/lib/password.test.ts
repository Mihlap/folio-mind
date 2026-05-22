import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password.js';

describe('password', () => {
  it('hashes and verifies', async () => {
    const hash = await hashPassword('secret-password');
    expect(await verifyPassword('secret-password', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });
});
