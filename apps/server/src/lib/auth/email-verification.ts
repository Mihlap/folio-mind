import { randomBytes } from 'node:crypto';
import type { Env } from '../config/env.js';
import { getApiPublicOrigin } from '../config/api-public-origin.js';
import { sha256Hex } from './password-reset.js';
export type EmailVerificationToken = {
  token: string;
  tokenHash: string;
  expiresAt: Date;
};
export function createEmailVerificationToken(env: Env): EmailVerificationToken {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = sha256Hex(token);
  const expiresAt = new Date(Date.now() + env.EMAIL_VERIFICATION_TOKEN_TTL_MINUTES * 60 * 1000);
  return { token, tokenHash, expiresAt };
}
export function buildVerifyEmailUrl(env: Env, token: string): string {
  const base = getApiPublicOrigin(env);
  return `${base}/auth/verify-email?token=${encodeURIComponent(token)}`;
}
