import { describe, expect, it } from 'vitest';
import {
  createTenantInviteToken,
  hashTenantInviteToken,
  isTenantInviteActive,
  TENANT_INVITE_TTL_MS,
} from './tenant-invite.js';

describe('tenant-invite', () => {
  it('creates unique token and stable hash', () => {
    const a = createTenantInviteToken();
    const b = createTenantInviteToken();
    expect(a.token).not.toBe(b.token);
    expect(hashTenantInviteToken(a.token)).toBe(a.tokenHash);
    expect(a.expiresAt.getTime()).toBeGreaterThan(Date.now() + TENANT_INVITE_TTL_MS - 5000);
  });

  it('detects active invite', () => {
    expect(
      isTenantInviteActive({
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      }),
    ).toBe(true);
    expect(
      isTenantInviteActive({
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      }),
    ).toBe(false);
  });
});
