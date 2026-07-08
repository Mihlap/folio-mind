import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
const MAX_AGE_MS = 10 * 60 * 1000;
export function createOAuthState(provider: string, secret: string): string {
  const nonce = randomBytes(16).toString('base64url');
  const issuedAt = Date.now().toString(36);
  const payload = `${provider}:${nonce}:${issuedAt}`;
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}
export function verifyOAuthState(state: string, provider: string, secret: string): boolean {
  const dot = state.lastIndexOf('.');
  if (dot < 0) return false;
  const payload = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  try {
    if (sig.length !== expected.length) return false;
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  } catch {
    return false;
  }
  const [p, , issuedAtB36] = payload.split(':');
  if (p !== provider) return false;
  const issuedAt = Number.parseInt(issuedAtB36, 36);
  if (!Number.isFinite(issuedAt) || Date.now() - issuedAt > MAX_AGE_MS) return false;
  return true;
}
