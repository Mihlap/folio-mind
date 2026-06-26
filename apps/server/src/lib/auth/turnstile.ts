import type { Env } from '../config/env.js';
type TurnstileResponse = {
  success: boolean;
  'error-codes'?: string[];
};
export async function verifyTurnstileToken(
  token: string | undefined,
  remoteIp: string | undefined,
  env: Env,
): Promise<boolean> {
  const secret = env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) return true;
  if (!token?.trim()) return false;
  const body = new URLSearchParams({
    secret,
    response: token,
  });
  if (remoteIp) body.set('remoteip', remoteIp);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) return false;
  const data = (await res.json()) as TurnstileResponse;
  return data.success === true;
}
