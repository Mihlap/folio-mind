import { randomBytes } from 'node:crypto';
import {
  DEFAULT_SHARE_LINK_TTL_PRESET,
  shareLinkTtlMs,
  type ShareLinkTtlPresetId,
} from '@folio-mind/pdf-contracts';
import type { Env } from '../config/env.js';
import { sha256Hex } from '../auth/password-reset.js';

export type ShareLinkToken = {
  token: string;
  tokenHash: string;
  expiresAt: Date;
};

export function createShareLinkToken(
  ttlPreset: ShareLinkTtlPresetId = DEFAULT_SHARE_LINK_TTL_PRESET,
): ShareLinkToken {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = sha256Hex(token);
  const expiresAt = new Date(Date.now() + shareLinkTtlMs(ttlPreset));
  return { token, tokenHash, expiresAt };
}

export function hashShareToken(token: string): string {
  return sha256Hex(token);
}

export function buildGuestShareUrl(env: Env, token: string): string {
  const base = env.FRONTEND_URL.replace(/\/+$/, '');
  return `${base}/share/${encodeURIComponent(token)}`;
}

export function isShareLinkActive(link: {
  expiresAt: Date;
  revokedAt: Date | null;
}): boolean {
  if (link.revokedAt) return false;
  return link.expiresAt.getTime() > Date.now();
}
