import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Env } from '../config/env.js';

const GUEST_PAGE_ACCESS_TTL_MS = 60 * 60 * 1000;

type GuestPageAccessPayload = {
  shareLinkId: string;
  shareToken: string;
  exp: number;
};

type GuestPageAccessEnv = Pick<Env, 'JWT_SECRET'>;

function signPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function encodeToken(payload: GuestPageAccessPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = signPayload(body, secret);
  return `${body}.${sig}`;
}

function decodeToken(access: string, secret: string): GuestPageAccessPayload | null {
  const dot = access.lastIndexOf('.');
  if (dot <= 0) return null;

  const body = access.slice(0, dot);
  const sig = access.slice(dot + 1);
  const expected = signPayload(body, secret);

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as GuestPageAccessPayload;
    if (
      typeof parsed.shareLinkId !== 'string' ||
      typeof parsed.shareToken !== 'string' ||
      typeof parsed.exp !== 'number'
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function createGuestPageAccessToken(params: {
  env: GuestPageAccessEnv;
  shareLinkId: string;
  shareToken: string;
}): string {
  return encodeToken(
    {
      shareLinkId: params.shareLinkId,
      shareToken: params.shareToken,
      exp: Date.now() + GUEST_PAGE_ACCESS_TTL_MS,
    },
    params.env.JWT_SECRET,
  );
}

export function verifyGuestPageAccessToken(params: {
  env: GuestPageAccessEnv;
  access: string;
  shareLinkId: string;
  shareToken: string;
}): boolean {
  const payload = decodeToken(params.access, params.env.JWT_SECRET);
  if (!payload) return false;
  if (payload.shareLinkId !== params.shareLinkId) return false;
  if (payload.shareToken !== params.shareToken) return false;
  if (payload.exp < Date.now()) return false;
  return true;
}
