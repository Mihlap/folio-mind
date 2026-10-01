import { describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { AUTH_EVENT_REGISTER } from './lib/metrics/auth-metrics.js';

const databaseUrl = process.env.DATABASE_URL?.trim();
const runDbIntegration = Boolean(databaseUrl);

const testEnv = {
  NODE_ENV: 'test' as const,
  PORT: 3001,
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
};

describe('API /health', () => {
  it('returns ok without database', async () => {
    const app = await buildApp({
      env: { ...testEnv, DATABASE_URL: undefined, REDIS_URL: '' },
      skipDatabase: true,
    });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(body.requestId).toBeDefined();
    await app.close();
  });
});

describe.skipIf(!runDbIntegration)('API DELETE with empty JSON body', () => {
  it('does not fail body parsing before auth', async () => {
    const app = await buildApp({ env: testEnv });
    const res = await app.inject({
      method: 'DELETE',
      url: '/documents/test-doc/share-links/test-link',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer invalid-token',
      },
      payload: '',
    });
    expect(res.statusCode).not.toBe(400);
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe.skipIf(!runDbIntegration)('API /auth/register', () => {
  it('creates tenant and user', async () => {
    const app = await buildApp({ env: testEnv });
    const email = `reg-${Date.now()}@folio-mind.test`;
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email, password: 'Password123', name: 'vv' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      needsEmailVerification: boolean;
      email: string;
    };
    expect(body.needsEmailVerification).toBe(true);
    expect(body.email).toBe(email.toLowerCase());
    await app.close();
  });

  it('records a registration metric', async () => {
    const app = await buildApp({ env: testEnv });
    const email = `reg-metric-${Date.now()}@folio-mind.test`;
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email, password: 'Password123', name: 'metric' },
    });
    expect(res.statusCode).toBe(201);

    const user = await app.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true, tenantId: true },
    });
    expect(user).not.toBeNull();

    const events = await app.prisma.authEvent.findMany({
      where: { userId: user?.id, type: AUTH_EVENT_REGISTER },
    });
    expect(events.length).toBe(1);
    expect(events[0]?.tenantId).toBe(user?.tenantId);

    await app.prisma.authEvent.deleteMany({ where: { userId: user?.id } });
    await app.prisma.user.deleteMany({ where: { id: user?.id } });
    await app.prisma.tenant.deleteMany({ where: { id: user?.tenantId } });
    await app.close();
  });
});
