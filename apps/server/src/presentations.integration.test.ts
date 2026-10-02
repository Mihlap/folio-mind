import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';

const databaseUrl = process.env.DATABASE_URL?.trim();
const runDbIntegration = Boolean(databaseUrl);

const testEnv = {
  NODE_ENV: 'test' as const,
  PORT: 3011,
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

type Slide = {
  id: string;
  position: number;
  title: string | null;
  subtitle: string | null;
  body: string | null;
  notes: string | null;
  layoutVariant: string;
  background: string | null;
  sourcePage: number | null;
  mediaAssetId: string | null;
};

type Presentation = {
  id: string;
  documentId: string | null;
  versionId: string | null;
  title: string;
  aiMode: string;
  slides: Slide[];
  createdAt: string;
  updatedAt: string;
};

async function signIn(email: string, password = 'Password123') {
  const app = await buildApp({ env: testEnv });
  const res = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email, password },
  });
  await app.close();
  expect(res.statusCode).toBe(200);
  return (res.json() as { token: string }).token;
}

async function createUserWithDocument(email: string) {
  const app = await buildApp({ env: testEnv });
  const register = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { email, password: 'Password123', name: 'Тест' },
  });
  expect(register.statusCode).toBe(201);
  const normalized = email.toLowerCase();

  const user = await app.prisma.user.findFirst({
    where: { email: normalized },
    select: { id: true, tenantId: true },
  });
  if (!user) {
    throw new Error(`Пользователь ${normalized} не создан`);
  }
  await app.prisma.user.update({
    where: { id: user.id },
    data: { emailVerifiedAt: new Date() },
  });

  const document = await app.prisma.document.create({
    data: {
      title: 'Документ для презентации',
      tenantId: user.tenantId,
      ownerId: user.id,
      versions: {
        create: {
          version: 1,
          s3Key: `test/${normalized}/demo.pdf`,
          status: 'ready',
          pageCount: 4,
        },
      },
    },
    include: { versions: true },
  });
  await app.close();

  const token = await signIn(email);
  return {
    token,
    documentId: document.id,
    versionId: document.versions[0]?.id,
  };
}

describe.skipIf(!runDbIntegration)('API /presentations', () => {
  const stamp = Date.now();
  const owner = {
    email: `present-owner-${stamp}@folio-mind.test`,
  };
  const stranger = {
    email: `present-stranger-${stamp}@folio-mind.test`,
  };

  let ownerToken: string;
  let strangerToken: string;
  let documentId: string;
  let versionId: string;
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    const created = await createUserWithDocument(owner.email);
    ownerToken = created.token;
    documentId = created.documentId;
    versionId = created.versionId ?? '';
    strangerToken = (await createUserWithDocument(stranger.email)).token;
    app = await buildApp({ env: testEnv });
  }, 180000);

  afterAll(async () => {
    const prisma = app?.prisma;
    if (prisma) {
      await prisma.presentation.deleteMany({ where: { documentId } });
      await prisma.document.deleteMany({ where: { id: documentId } });
    }
    await app?.close();
  });

  it('returns null when nothing is saved yet', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/presentations?documentId=${documentId}&versionId=${versionId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { item: Presentation | null }).item).toBeNull();
  });

  it('requires authentication', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/presentations?documentId=${documentId}`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('does not expose the presentation to another tenant', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/presentations?documentId=${documentId}`,
      headers: { authorization: `Bearer ${strangerToken}` },
    });
    expect([403, 404]).toContain(res.statusCode);
  });

  it('saves slides and keeps their order', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/presentations',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        documentId,
        versionId,
        title: 'Презентация для заказчика',
        aiMode: 'none',
        slides: [
          { position: 1, title: 'Обложка', sourcePage: 1, layoutVariant: 'image_full' },
          { position: 0, title: 'Планировка', sourcePage: 2, layoutVariant: 'image_right' },
          { position: 2, title: 'Итоги', body: '- пункт', layoutVariant: 'title_only' },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Presentation;
    expect(body.title).toBe('Презентация для заказчика');
    expect(body.slides).toHaveLength(3);
    expect(body.slides.map((slide) => slide.position)).toEqual([0, 1, 2]);
    expect(body.slides.map((slide) => slide.title)).toEqual([
      'Планировка',
      'Обложка',
      'Итоги',
    ]);
  });

  it('replaces slides on the next save instead of duplicating them', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/presentations',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        documentId,
        versionId,
        title: 'Презентация для заказчика',
        aiMode: 'none',
        slides: [{ position: 0, title: 'Только титул', sourcePage: 1 }],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Presentation;
    expect(body.slides).toHaveLength(1);
    expect(body.slides[0].title).toBe('Только титул');
  });

  it('rejects a page outside the document', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/presentations',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        documentId,
        versionId,
        title: 'Ошибка',
        aiMode: 'none',
        slides: [{ position: 0, title: 'Лишняя', sourcePage: 99 }],
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a version that belongs to another document', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/presentations',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        documentId,
        versionId: 'несуществующая-версия',
        title: 'Ошибка',
        aiMode: 'none',
        slides: [],
      },
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejects an unknown media asset', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/presentations',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        documentId,
        versionId,
        title: 'Ошибка',
        aiMode: 'none',
        slides: [{ position: 0, title: 'Чужое фото', mediaAssetId: 'нет-такого' }],
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('forbids saving without edit rights', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/presentations',
      headers: { authorization: `Bearer ${strangerToken}` },
      payload: { documentId, versionId, title: 'Взлом', aiMode: 'none', slides: [] },
    });
    expect([403, 404]).toContain(res.statusCode);
  });

  it('deletes the presentation and its slides', async () => {
    const before = await app.inject({
      method: 'GET',
      url: `/presentations?documentId=${documentId}&versionId=${versionId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    const beforeBody = before.json() as { item: Presentation | null };
    const presentationId = beforeBody.item?.id;
    expect(presentationId).toBeTruthy();

    const res = await app.inject({
      method: 'DELETE',
      url: `/presentations?versionId=${versionId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(res.statusCode).toBe(200);

    const check = await app.inject({
      method: 'GET',
      url: `/presentations?documentId=${documentId}&versionId=${versionId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect((check.json() as { item: Presentation | null }).item).toBeNull();

    const prisma = app.prisma;
    const slides = await prisma.presentationSlide.count({
      where: { presentationId },
    });
    expect(slides).toBe(0);
  });

  it('deletes the presentation together with its document', async () => {
    const created = await createUserWithDocument(`present-cascade-${Date.now()}@folio-mind.test`);
    const save = await app.inject({
      method: 'PUT',
      url: '/presentations',
      headers: { authorization: `Bearer ${created.token}` },
      payload: {
        documentId: created.documentId,
        versionId: created.versionId,
        title: 'Каскад',
        aiMode: 'none',
        slides: [{ position: 0, title: 'Слайд', sourcePage: 1 }],
      },
    });
    expect(save.statusCode).toBe(200);
    const presentationId = (save.json() as Presentation).id;

    const prisma = app.prisma;
    await prisma.document.delete({ where: { id: created.documentId } });

    const removed = await prisma.presentation.findUnique({
      where: { id: presentationId },
      select: { id: true },
    });
    expect(removed).toBeNull();

    const orphanSlides = await prisma.presentationSlide.count({ where: { presentationId } });
    expect(orphanSlides).toBe(0);
  });

  it('does not leak a deleted document presentation into the standalone list', async () => {
    const created = await createUserWithDocument(`present-orphan-${Date.now()}@folio-mind.test`);
    const save = await app.inject({
      method: 'PUT',
      url: '/presentations',
      headers: { authorization: `Bearer ${created.token}` },
      payload: {
        documentId: created.documentId,
        versionId: created.versionId,
        title: 'Осиротевшая',
        aiMode: 'none',
        slides: [{ position: 0, title: 'Слайд', sourcePage: 1 }],
      },
    });
    expect(save.statusCode).toBe(200);

    await app.prisma.document.delete({ where: { id: created.documentId } });

    const list = await app.inject({
      method: 'GET',
      url: '/presentations?standalone=1',
      headers: { authorization: `Bearer ${created.token}` },
    });
    expect(list.statusCode).toBe(200);
    const titles = (list.json() as { items: Presentation[] }).items.map((item) => item.title);
    expect(titles).not.toContain('Осиротевшая');
  });
});

describe.skipIf(!runDbIntegration)('API /presentations standalone', () => {
  const stamp = Date.now();

  let ownerToken: string;
  let strangerToken: string;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let presentationId = '';

  beforeAll(async () => {
    ownerToken = (await createUserWithDocument(`standalone-owner-${stamp}@folio-mind.test`)).token;
    strangerToken = (await createUserWithDocument(`standalone-stranger-${stamp}@folio-mind.test`))
      .token;
    app = await buildApp({ env: testEnv });
  }, 180000);

  afterAll(async () => {
    const prisma = app?.prisma;
    if (prisma) {
      const user = await prisma.user.findFirst({
        where: { email: `standalone-owner-${stamp}@folio-mind.test`.toLowerCase() },
        select: { tenantId: true },
      });
      if (user) {
        await prisma.presentation.deleteMany({
          where: { tenantId: user.tenantId, documentId: null },
        });
      }
    }
    await app?.close();
  });

  it('creates a presentation without a document', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/presentations',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        title: 'Титульный показ',
        aiMode: 'none',
        slides: [
          { position: 0, title: 'Первый', layoutVariant: 'title_only' },
          { position: 1, title: 'Второй', layoutVariant: 'section' },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Presentation;
    expect(body.documentId).toBeNull();
    expect(body.versionId).toBeNull();
    expect(body.slides.map((slide) => slide.title)).toEqual(['Первый', 'Второй']);
    presentationId = body.id;
  });

  it('rejects a source page without a document', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/presentations',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        id: presentationId,
        title: 'Титульный показ',
        aiMode: 'none',
        slides: [{ position: 0, title: 'Слайд', sourcePage: 2 }],
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('replaces slides on the next save', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/presentations',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        id: presentationId,
        title: 'Титульный показ',
        aiMode: 'none',
        slides: [{ position: 0, title: 'Один слайд', layoutVariant: 'title_only' }],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Presentation;
    expect(body.id).toBe(presentationId);
    expect(body.slides.length).toBe(1);
    expect(body.slides[0]?.title).toBe('Один слайд');
  });

  it('lists standalone presentations and loads one by id', async () => {
    const list = await app.inject({
      method: 'GET',
      url: '/presentations?standalone=1',
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(list.statusCode).toBe(200);
    const items = (list.json() as { items: Presentation[] }).items;
    expect(items.some((item) => item.id === presentationId)).toBe(true);

    const one = await app.inject({
      method: 'GET',
      url: `/presentations?id=${presentationId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(one.statusCode).toBe(200);
    expect((one.json() as { item: Presentation | null }).item?.id).toBe(presentationId);
  });

  it('hides standalone presentations from other tenants', async () => {
    const list = await app.inject({
      method: 'GET',
      url: '/presentations?standalone=1',
      headers: { authorization: `Bearer ${strangerToken}` },
    });
    expect(list.statusCode).toBe(200);
    const items = (list.json() as { items: Presentation[] }).items;
    expect(items.some((item) => item.id === presentationId)).toBe(false);

    const one = await app.inject({
      method: 'GET',
      url: `/presentations?id=${presentationId}`,
      headers: { authorization: `Bearer ${strangerToken}` },
    });
    expect([403, 404]).toContain(one.statusCode);
  });

  it('forbids another user from editing or deleting', async () => {
    const save = await app.inject({
      method: 'PUT',
      url: '/presentations',
      headers: { authorization: `Bearer ${strangerToken}` },
      payload: {
        id: presentationId,
        title: 'Взлом',
        aiMode: 'none',
        slides: [],
      },
    });
    expect([403, 404]).toContain(save.statusCode);

    const del = await app.inject({
      method: 'DELETE',
      url: `/presentations?id=${presentationId}`,
      headers: { authorization: `Bearer ${strangerToken}` },
    });
    expect([403, 404]).toContain(del.statusCode);
  });

  it('deletes the standalone presentation by id', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/presentations?id=${presentationId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(res.statusCode).toBe(200);

    const prisma = app.prisma;
    const slides = await prisma.presentationSlide.count({ where: { presentationId } });
    expect(slides).toBe(0);

    const gone = await app.inject({
      method: 'GET',
      url: `/presentations?id=${presentationId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(gone.statusCode).toBe(404);
  });
});
