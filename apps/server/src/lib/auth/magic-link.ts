import { randomBytes } from 'node:crypto';
import type { Env } from '../config/env.js';
import { sha256Hex } from './password-reset.js';

export type MagicLinkToken = {
  token: string;
  tokenHash: string;
  expiresAt: Date;
};

export function createMagicLinkToken(env: Env): MagicLinkToken {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = sha256Hex(token);
  const expiresAt = new Date(
    Date.now() + env.MAGIC_LINK_TOKEN_TTL_MINUTES * 60 * 1000,
  );
  return { token, tokenHash, expiresAt };
}

export function buildMagicLinkUrl(env: Env, token: string): string {
  const base = env.FRONTEND_URL.replace(/\/+$/, '');
  return `${base}/magic-link/verify?token=${encodeURIComponent(token)}`;
}
