import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const HOUR_MS = 60 * 60 * 1000;

export const SHARE_TTL_MIN_HOURS = 1;
export const SHARE_TTL_MAX_HOURS = 168;
export const SHARE_TTL_DEFAULT_HOURS = 24;

export type ShareToken = {
  token: string;
  expiresAt: string;
  ttlHours: number;
};

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

/**
 * Разовая ссылка на статистику. Подпись HMAC по секрету метрик,
 * поэтому подделать или продлить срок без секрета нельзя.
 */
export function createMetricsShareToken(
  secret: string,
  hours = SHARE_TTL_DEFAULT_HOURS,
): ShareToken {
  const ttlHours = Math.min(Math.max(hours, SHARE_TTL_MIN_HOURS), SHARE_TTL_MAX_HOURS);
  const nonce = randomBytes(16).toString('base64url');
  const expiresAtMs = Date.now() + ttlHours * HOUR_MS;
  const payload = `m:${nonce}:${expiresAtMs.toString(36)}`;
  const sig = sign(payload, secret);
  return {
    token: `${payload}.${sig}`,
    expiresAt: new Date(expiresAtMs).toISOString(),
    ttlHours,
  };
}

export type ShareTokenCheck =
  | { ok: true; expiresAtMs: number }
  | { ok: false; reason: 'malformed' | 'bad-signature' | 'expired' };

/**
 * Проверяет подпись и срок жизни ссылки.
 * Возвращает причину отказа, чтобы показать её на странице.
 */
export function verifyMetricsShareToken(token: string, secret: string): ShareTokenCheck {
  const dot = token.lastIndexOf('.');
  if (dot < 0) return { ok: false, reason: 'malformed' };
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(payload, secret);
  try {
    if (sig.length !== expected.length) return { ok: false, reason: 'bad-signature' };
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return { ok: false, reason: 'bad-signature' };
    }
  } catch {
    return { ok: false, reason: 'bad-signature' };
  }

  const [prefix, , expiresAtB36] = payload.split(':');
  if (prefix !== 'm') return { ok: false, reason: 'malformed' };
  const expiresAtMs = Number.parseInt(expiresAtB36, 36);
  if (!Number.isFinite(expiresAtMs)) return { ok: false, reason: 'malformed' };
  if (Date.now() >= expiresAtMs) return { ok: false, reason: 'expired' };
  return { ok: true, expiresAtMs };
}
