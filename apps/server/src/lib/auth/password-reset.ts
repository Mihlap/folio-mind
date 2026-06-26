import { createHash, randomBytes } from 'node:crypto';
import type { Env } from '../config/env.js';
export type PasswordResetToken = {
  token: string;
  tokenHash: string;
  expiresAt: Date;
};
export function createPasswordResetToken(env: Env): PasswordResetToken {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = sha256Hex(token);
  const expiresAt = new Date(Date.now() + env.PASSWORD_RESET_TOKEN_TTL_MINUTES * 60 * 1000);
  return { token, tokenHash, expiresAt };
}
export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
export function buildPasswordResetUrl(env: Env, token: string): string {
  const base = env.FRONTEND_URL.replace(/\/+$/, '');
  return `${base}/reset-password?token=${encodeURIComponent(token)}`;
}
