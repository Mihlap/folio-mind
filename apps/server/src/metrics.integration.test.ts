import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import {
  AUTH_EVENT_LOGIN,
  AUTH_EVENT_REGISTER,
  getAuthMetrics,
  recordAuthEvent,
} from './lib/metrics/auth-metrics.js';
import { createMetricsShareToken } from './lib/metrics/share-token.js';
import { authEventRetentionDays, sweepStaleAuthEvents } from './lib/metrics/retention.js';

const databaseUrl = process.env.DATABASE_URL?.trim();
const runDbIntegration = Boolean(databaseUrl);
const metricsToken = 'metrics-token-min-32-characters-long';

const testEnv = {
  NODE_ENV: 'test' as const,
  PORT: 3012,
  API_HOST: '127.0.0.1',
  JWT_SECRET: 'test-secret-min-32-characters-long',
  CORS_ORIGIN: 'http://localhost:5173',
  FRONTEND_URL: 'http://localhost:5173',
  PASSWORD_RESET_TOKEN_TTL_MINUTES: 30,
  SMTP_SECURE: false,
  REDIS_URL: process.env.REDIS_URL?.trim() || '',
  DATABASE_URL: databaseUrl,
  S3_REGION: 'ru-1',
  S3_FORCE_PATH_STYLE: true as const,
  AI_PROVIDER: 'gigachat' as const,
  AI_CHAT_MODE: 'auto' as const,
  GIGACHAT_SCOPE: 'GIGACHAT_API_PERS',
  GIGACHAT_MODEL: 'GigaChat',
  GIGACHAT_TIMEOUT: 180,
  YANDEX_MODEL: 'yandexgpt/latest',
  AI_TENANT_DAILY_REQUESTS: 100,
  PREVIEW_INITIAL_PAGES: 15,
  PREVIEW_MAX_PAGES: 200,
  PREVIEW_THUMB_BATCH: 20,
  PREVIEW_JOB_TIMEOUT_MS: 300000,
  AI_JOB_TIMEOUT_MS: 180000,
  QUEUE_WARN_WAITING: 50,
  EMAIL_VERIFICATION_TOKEN_TTL_MINUTES: 60,
  MAGIC_LINK_TOKEN_TTL_MINUTES: 15,
  SKIP_EMAIL_MX_CHECK: true,
  SMS_PROVIDER: 'dummy' as const,
  SMS_CODE_TTL_MINUTES: 5,
  AUTH_METRICS_TOKEN: metricsToken,
};

type MetricsBody = {
  from: string;
  to: string;
  registrations: number;
  logins: number;
  activeUsers: number;
  byDay: Array<{ day: string; registrations: number; logins: number }>;
};

describe.skipIf(!runDbIntegration)('GET /metrics/auth', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let tenantId: string;
  let userId: string;

  beforeAll(async () => {
    app = await buildApp({ env: testEnv });
    const tenant = await app.prisma.tenant.create({
      data: { name: `metrics-${Date.now()}` },
    });
    const user = await app.prisma.user.create({
      data: {
        email: `metrics-${Date.now()}@folio-mind.test`,
        passwordHash: 'x',
        tenantId: tenant.id,
        emailVerifiedAt: new Date(),
      },
    });
    tenantId = tenant.id;
    userId = user.id;

    await app.prisma.authEvent.deleteMany({
      where: { tenantId: { in: [tenantId] } },
    });
    await recordAuthEvent(app.prisma, {
      type: AUTH_EVENT_REGISTER,
      userId,
      tenantId,
    });
    await recordAuthEvent(app.prisma, { type: AUTH_EVENT_LOGIN, userId, tenantId });
    await recordAuthEvent(app.prisma, { type: AUTH_EVENT_LOGIN, userId, tenantId });
  }, 180000);

  afterAll(async () => {
    if (app?.prisma) {
      await app.prisma.authEvent.deleteMany({ where: { tenantId } });
      await app.prisma.user.deleteMany({ where: { tenantId } });
      await app.prisma.tenant.deleteMany({ where: { id: tenantId } });
    }
    await app?.close();
  });

  it('rejects requests without a token', async () => {
    const res = await app.inject({ method: 'GET', url: '/metrics/auth' });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a wrong token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/metrics/auth',
      headers: { authorization: 'Bearer wrong-token-value-1234567890' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns daily registrations and logins', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/metrics/auth?days=30',
      headers: { authorization: `Bearer ${metricsToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as MetricsBody;
    expect(body.byDay.length).toBe(30);
    expect(body.registrations).toBeGreaterThanOrEqual(1);
    expect(body.logins).toBeGreaterThanOrEqual(2);
    expect(body.activeUsers).toBeGreaterThanOrEqual(1);

    const today = new Date().toISOString().slice(0, 10);
    const todayBucket = body.byDay.find((day) => day.day === today);
    expect(todayBucket?.registrations).toBeGreaterThanOrEqual(1);
    expect(todayBucket?.logins).toBeGreaterThanOrEqual(2);
  });

  it('counts only registrations and logins, ignoring other event types', async () => {
    await app.prisma.authEvent.deleteMany({ where: { type: 'password_reset' } });
    const before = await getAuthMetrics(app.prisma, { days: 30 });
    await app.prisma.authEvent.create({
      data: { type: 'password_reset', userId, tenantId },
    });
    const after = await getAuthMetrics(app.prisma, { days: 30 });
    await app.prisma.authEvent.deleteMany({ where: { type: 'password_reset' } });

    expect(after.registrations).toBe(before.registrations);
    expect(after.logins).toBe(before.logins);
  });
});

describe.skipIf(!runDbIntegration)('срок хранения событий', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let tenantId: string;
  const originalRetention = process.env.AUTH_EVENT_RETENTION_DAYS;
  const DAY_MS = 24 * 60 * 60 * 1000;

  const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS);

  beforeAll(async () => {
    app = await buildApp({ env: testEnv });
    const tenant = await app.prisma.tenant.create({ data: { name: `retention-${Date.now()}` } });
    tenantId = tenant.id;
  }, 180000);

  afterAll(async () => {
    if (originalRetention === undefined) delete process.env.AUTH_EVENT_RETENTION_DAYS;
    else process.env.AUTH_EVENT_RETENTION_DAYS = originalRetention;
    if (app?.prisma) {
      await app.prisma.authEvent.deleteMany({ where: { tenantId } });
      await app.prisma.tenant.deleteMany({ where: { id: tenantId } });
    }
    await app?.close();
  });

  it('по умолчанию хранит 12 месяцев', () => {
    delete process.env.AUTH_EVENT_RETENTION_DAYS;
    expect(authEventRetentionDays()).toBe(365);
  });

  it('уважает заданное значение', () => {
    process.env.AUTH_EVENT_RETENTION_DAYS = '30';
    expect(authEventRetentionDays()).toBe(30);
  });

  it('игнорирует бессмысленные значения', () => {
    process.env.AUTH_EVENT_RETENTION_DAYS = 'не число';
    expect(authEventRetentionDays()).toBe(365);
    process.env.AUTH_EVENT_RETENTION_DAYS = '0';
    expect(authEventRetentionDays()).toBe(365);
    process.env.AUTH_EVENT_RETENTION_DAYS = '-5';
    expect(authEventRetentionDays()).toBe(365);
  });

  it('удаляет события старше срока и держит свежие', async () => {
    await app.prisma.authEvent.deleteMany({ where: { tenantId } });
    process.env.AUTH_EVENT_RETENTION_DAYS = '30';

    const old = await app.prisma.authEvent.create({
      data: { type: AUTH_EVENT_REGISTER, tenantId, createdAt: daysAgo(40) },
    });
    await recordAuthEvent(app.prisma, { type: AUTH_EVENT_REGISTER, tenantId });

    expect(await sweepStaleAuthEvents(app.prisma, { tenantId })).toBe(1);

    const left = await app.prisma.authEvent.findMany({ where: { tenantId } });
    expect(left.map((row) => row.id)).not.toContain(old.id);
    expect(left.length).toBe(1);
  });

  it('не удаляет ничего, пока срок не наступил', async () => {
    await app.prisma.authEvent.deleteMany({ where: { tenantId } });
    process.env.AUTH_EVENT_RETENTION_DAYS = '365';
    await app.prisma.authEvent.create({
      data: { type: AUTH_EVENT_REGISTER, tenantId, createdAt: daysAgo(100) },
    });

    expect(await sweepStaleAuthEvents(app.prisma, { tenantId })).toBe(0);
    expect(await app.prisma.authEvent.count({ where: { tenantId } })).toBe(1);
  });

  it('удаляет крупными порциями', async () => {
    await app.prisma.authEvent.deleteMany({ where: { tenantId } });
    process.env.AUTH_EVENT_RETENTION_DAYS = '1';
    const count = 12;
    await app.prisma.authEvent.createMany({
      data: Array.from({ length: count }, () => ({
        type: AUTH_EVENT_REGISTER,
        tenantId,
        createdAt: daysAgo(10),
      })),
    });

    expect(await sweepStaleAuthEvents(app.prisma, { tenantId })).toBe(count);
    expect(await app.prisma.authEvent.count({ where: { tenantId } })).toBe(0);
  });

  it('не трогает события других организаций', async () => {
    await app.prisma.authEvent.deleteMany({ where: { tenantId } });
    process.env.AUTH_EVENT_RETENTION_DAYS = '1';
    const other = await app.prisma.tenant.create({ data: { name: `other-${Date.now()}` } });
    try {
      await app.prisma.authEvent.create({
        data: { type: AUTH_EVENT_REGISTER, tenantId: other.id, createdAt: daysAgo(90) },
      });
      await app.prisma.authEvent.create({
        data: { type: AUTH_EVENT_REGISTER, tenantId, createdAt: daysAgo(90) },
      });

      expect(await sweepStaleAuthEvents(app.prisma, { tenantId })).toBe(1);
      expect(await app.prisma.authEvent.count({ where: { tenantId: other.id } })).toBe(1);
    } finally {
      await app.prisma.authEvent.deleteMany({ where: { tenantId: other.id } });
      await app.prisma.tenant.deleteMany({ where: { id: other.id } });
    }
  });
});

describe.skipIf(!runDbIntegration)('POST /metrics/auth/share', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let tenantId: string;

  beforeAll(async () => {
    app = await buildApp({ env: testEnv });
    const tenant = await app.prisma.tenant.create({ data: { name: `share-${Date.now()}` } });
    tenantId = tenant.id;
    await app.prisma.authEvent.deleteMany({ where: { tenantId } });
  }, 180000);

  afterAll(async () => {
    if (app?.prisma) {
      await app.prisma.authEvent.deleteMany({ where: { tenantId } });
      await app.prisma.tenant.deleteMany({ where: { id: tenantId } });
    }
    await app?.close();
  });

  it('не выдаёт ссылку без токена метрик', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/metrics/auth/share',
      headers: { 'content-type': 'application/json' },
      payload: {},
    });
    expect(res.statusCode).toBe(401);
  });

  it('выдаёт ссылку на 24 часа по умолчанию', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/metrics/auth/share?days=30',
      headers: { authorization: `Bearer ${metricsToken}` },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { url: string; token: string; hours: number; days: number };
    expect(body.hours).toBe(24);
    expect(body.days).toBe(30);
    expect(body.url).toContain(`/metrics/auth/share/${body.token}`);
    expect(body.url).toContain('days=30');
  });

  it('уважает заданный срок в часах', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/metrics/auth/share?days=7',
      headers: { authorization: `Bearer ${metricsToken}` },
      payload: { hours: 2 },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { hours: number; days: number }).hours).toBe(2);
  });

  it('открывает статистику по выданной ссылке без основного токена', async () => {
    const issue = await app.inject({
      method: 'POST',
      url: '/metrics/auth/share?days=30',
      headers: { authorization: `Bearer ${metricsToken}` },
      payload: {},
    });
    const { token } = issue.json() as { token: string };

    const res = await app.inject({ method: 'GET', url: `/metrics/auth/share/${token}?days=30` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('Посещаемость');
    expect(res.body).toContain('Регистраций');
    expect(res.body).not.toContain(metricsToken);
  });

  it('не открывает страницу по подделанной ссылке', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/metrics/auth/share/m:aaaaaaaaaaaaaa:zzzzzzzzzz.AAAA',
    });
    expect(res.statusCode).toBe(401);
    expect(res.body).toContain('Ссылка недействительна');
  });

  it('отвечает 410 на истёкшую ссылку', async () => {
    const expired = createMetricsShareToken(metricsToken, 1);
    const stale = shiftTokenExpiry(expired.token, -60 * 60 * 1000);
    const res = await app.inject({ method: 'GET', url: `/metrics/auth/share/${stale}` });
    expect(res.statusCode).toBe(410);
    expect(res.body).toContain('Срок действия ссылки истёк');
  });
});

/** Переписывает срок в подписанном токене, чтобы получить заведомо истёкшую ссылку. */
function shiftTokenExpiry(token: string, deltaMs: number): string {
  const dot = token.lastIndexOf('.');
  const [, nonce, expiresB36] = token.slice(0, dot).split(':');
  const payload = `m:${nonce}:${(Number.parseInt(expiresB36, 36) + deltaMs).toString(36)}`;
  return `${payload}.${createHmac('sha256', metricsToken).update(payload).digest('base64url')}`;
}
