const API = process.env.SMOKE_API_URL ?? 'http://localhost:3001';
const PASS = 'Smoke-test-pass-123';

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, options);
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`${options.method ?? 'GET'} ${path} → ${res.status}: ${text.slice(0, 400)}`);
  }
  return json;
}

function tinyPng() {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
}

async function main() {
  const email = `media-smoke.${Date.now()}@gmail.com`;
  await api('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASS, name: 'Media Smoke' }),
  });
  const { createRequire } = await import('node:module');
  const serverRequire = createRequire(new URL('../apps/server/package.json', import.meta.url));
  const { PrismaClient } = serverRequire('@prisma/client');
  const prisma = new PrismaClient();
  await prisma.user.update({
    where: { email: email.toLowerCase() },
    data: { emailVerifiedAt: new Date() },
  });
  await prisma.$disconnect();
  const login = await api('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASS }),
  });
  const token = login.token;
  if (!token) throw new Error('login missing token');
  console.log('logged in', email);

  const created = await api('/media-assets', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      fileName: 'test.png',
      mimeType: 'image/png',
      size: tinyPng().length,
      width: 1,
      height: 1,
    }),
  });
  console.log('created', created);

  const form = new FormData();
  form.append('file', new Blob([tinyPng()], { type: 'image/png' }), 'test.png');
  const uploadRes = await fetch(`${API}/media-assets/${created.id}/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const uploadText = await uploadRes.text();
  console.log('upload status', uploadRes.status, uploadText.slice(0, 500));
  if (!uploadRes.ok) throw new Error(`upload failed: ${uploadRes.status}`);

  let uploadJson;
  try {
    uploadJson = JSON.parse(uploadText);
  } catch {
    throw new Error('upload response is not JSON');
  }
  if (uploadJson.status !== 'ready') {
    throw new Error(`expected status ready, got ${uploadJson.status}`);
  }

  const contentRes = await fetch(`${API}/media-assets/${created.id}/content`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!contentRes.ok) throw new Error(`content ${contentRes.status}`);
  console.log('content bytes', (await contentRes.arrayBuffer()).byteLength);

  const list = await api('/media-assets', {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log(
    'list count',
    list.items?.length ?? 0,
    list.items?.[0]?.title,
    list.items?.[0]?.status,
  );

  const quota = await api('/media-assets/quota', {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log('quota', quota);
  if (!quota.maxFileBytes || !quota.limitBytes) {
    throw new Error('quota response incomplete');
  }

  console.log('OK media smoke');
}

main().catch((err) => {
  console.error('FAIL', err.message);
  process.exit(1);
});
