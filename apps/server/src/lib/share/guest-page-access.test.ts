import { describe, expect, it } from 'vitest';
import { createGuestPageAccessToken, verifyGuestPageAccessToken } from './guest-page-access.js';

const env = { JWT_SECRET: 'test-secret' } as const;

describe('guest-page-access', () => {
  it('creates and verifies a page access token', () => {
    const access = createGuestPageAccessToken({
      env,
      shareLinkId: 'link-1',
      shareToken: 'token-abc',
    });

    expect(
      verifyGuestPageAccessToken({
        env,
        access,
        shareLinkId: 'link-1',
        shareToken: 'token-abc',
      }),
    ).toBe(true);
  });

  it('rejects token for another link or share token', () => {
    const access = createGuestPageAccessToken({
      env,
      shareLinkId: 'link-1',
      shareToken: 'token-abc',
    });

    expect(
      verifyGuestPageAccessToken({
        env,
        access,
        shareLinkId: 'link-2',
        shareToken: 'token-abc',
      }),
    ).toBe(false);

    expect(
      verifyGuestPageAccessToken({
        env,
        access,
        shareLinkId: 'link-1',
        shareToken: 'token-other',
      }),
    ).toBe(false);
  });

  it('rejects tampered token', () => {
    const access = createGuestPageAccessToken({
      env,
      shareLinkId: 'link-1',
      shareToken: 'token-abc',
    });

    expect(
      verifyGuestPageAccessToken({
        env,
        access: `${access}x`,
        shareLinkId: 'link-1',
        shareToken: 'token-abc',
      }),
    ).toBe(false);
  });
});
