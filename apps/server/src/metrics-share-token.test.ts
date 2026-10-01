import { describe, expect, it } from 'vitest';
import { createMetricsShareToken, verifyMetricsShareToken } from './lib/metrics/share-token.js';

const SECRET = 'metrics-secret-for-tests';
const OTHER_SECRET = 'another-secret';

describe('share-token', () => {
  it('принимает только что выданный токен', () => {
    const share = createMetricsShareToken(SECRET);
    const check = verifyMetricsShareToken(share.token, SECRET);
    expect(check.ok).toBe(true);
  });

  it('отклоняет подделку подписи', () => {
    const share = createMetricsShareToken(SECRET);
    const check = verifyMetricsShareToken(share.token, OTHER_SECRET);
    expect(check).toEqual({ ok: false, reason: 'bad-signature' });
  });

  it('отклоняет изменённый payload', () => {
    const share = createMetricsShareToken(SECRET, 100);
    const forged = `${share.token.slice(0, -4)}AAAA`;
    expect(verifyMetricsShareToken(forged, SECRET).ok).toBe(false);
  });

  it('отклоняет мусор', () => {
    expect(verifyMetricsShareToken('nonsense', SECRET)).toEqual({ ok: false, reason: 'malformed' });
  });

  it('возвращает срок, близкий к заданному', () => {
    const share = createMetricsShareToken(SECRET, 5);
    const check = verifyMetricsShareToken(share.token, SECRET);
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    const diffMs = check.expiresAtMs - Date.now();
    expect(diffMs).toBeGreaterThan(4 * 60 * 60 * 1000);
    expect(diffMs).toBeLessThanOrEqual(5 * 60 * 60 * 1000);
  });

  it('по умолчанию действует сутки', () => {
    const share = createMetricsShareToken(SECRET);
    expect(share.ttlHours).toBe(24);
  });
});
