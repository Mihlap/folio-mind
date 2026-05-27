import { describe, expect, it } from 'vitest';
import { buildApp } from './app.js';

const testEnv = {
  NODE_ENV: 'test' as const,
  PORT: 3001,
  API_HOST: '127.0.0.1',
  JWT_SECRET: 'test-secret-min-32-characters-long',
  CORS_ORIGIN: 'http://localhost:5173',
  FRONTEND_URL: 'http://localhost:5173',
  PASSWORD_RESET_TOKEN_TTL_MINUTES: 30,
  SMTP_SECURE: false,
  REDIS_URL: 'redis://localhost:6379',
  DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://folio:folio@localhost:5434/folio_mind',
  S3_REGION: 'ru-1',
  S3_FORCE_PATH_STYLE: true as const,
  AI_PROVIDER: 'gigachat' as const,
  GIGACHAT_SCOPE: 'GIGACHAT_API_PERS',
  GIGACHAT_MODEL: 'GigaChat',
  GIGACHAT_TIMEOUT: 180,
  YANDEX_MODEL: 'yandexgpt/latest',
  AI_TENANT_DAILY_REQUESTS: 100,
  PREVIEW_INITIAL_PAGES: 15,
  PREVIEW_MAX_PAGES: 200,
  PREVIEW_THUMB_BATCH: 20,
  PREVIEW_JOB_TIMEOUT_MS: 300_000,
  AI_JOB_TIMEOUT_MS: 180_000,
  QUEUE_WARN_WAITING: 50,
};

describe('API /health', () => {
  it('returns ok without database', async () => {
    const app = await buildApp({
      env: { ...testEnv, DATABASE_URL: undefined },
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

describe('API /auth/register', () => {
  it('creates tenant and user', async () => {
    const app = await buildApp({ env: testEnv });
    const email = `reg-${Date.now()}@folio-mind.test`;

    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email, password: 'password123', name: 'vv' },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as { token: string; user: { email: string } };
    expect(body.token).toBeTruthy();
    expect(body.user.email).toBe(email);
    await app.close();
  });
});
