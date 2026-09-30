export const API = process.env.SMOKE_API_URL ?? 'http://localhost:3001';
export const WEB = process.env.SMOKE_WEB_URL ?? 'http://localhost:5173';
export const PASS = 'Presentation-smoke-pass-123';
export const DEMO_EMAIL = 'pres.demo.folio@gmail.com';
export const DEMO_PASSWORD = PASS;
export const DEMO_TITLE = 'ЖК Северный — презентация';

export async function api(path, options = {}) {
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

export async function checkApiHealth() {
  try {
    const res = await fetch(`${API}/health`, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`API ${API}/health недоступен (${msg}). Запустите: pnpm dev (server :3001).`);
  }
}

export function authHeaders(token, json = true) {
  return {
    Authorization: `Bearer ${token}`,
    ...(json ? { 'Content-Type': 'application/json' } : {}),
  };
}

async function serverRequire() {
  const { createRequire } = await import('node:module');
  return createRequire(new URL('../../apps/worker/package.json', import.meta.url));
}

export async function markVerified(email) {
  const require = await serverRequire();
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  try {
    await prisma.user.update({
      where: { email: email.toLowerCase() },
      data: { emailVerifiedAt: new Date() },
    });
  } finally {
    await prisma.$disconnect();
  }
}

export async function registerVerified(label) {
  const email = `${label}.${Date.now()}@gmail.com`;
  await api('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASS, name: label }),
  });
  await markVerified(email);
  const login = await api('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASS }),
  });
  if (!login.token) throw new Error('login missing token');
  return { email, token: login.token };
}

export async function makePdf(pageCount) {
  const require = await serverRequire();
  const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([595, 842]);
    page.drawText(`Smoke document page ${i + 1}`, {
      x: 60,
      y: 760,
      size: 28,
      font,
      color: rgb(0.1, 0.1, 0.35),
    });
    page.drawRectangle({
      x: 60,
      y: 420,
      width: 200,
      height: 260,
      color: rgb(0.85, 0.88, 0.95),
    });
  }
  return Buffer.from(await doc.save());
}

export async function uploadPdf(token, pdfBuffer, title) {
  const created = await api('/documents', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      title,
      fileName: `${title}.pdf`,
      mimeType: 'application/pdf',
      size: pdfBuffer.length,
    }),
  });
  const documentId = created.document.id;
  const versionId = created.versionId;

  let viaProxy = false;
  try {
    const put = await fetch(created.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/pdf' },
      body: pdfBuffer,
      signal: AbortSignal.timeout(45_000),
    });
    if (!put.ok) throw new Error(`HTTP ${put.status}`);
  } catch {
    const form = new FormData();
    form.append('file', new Blob([pdfBuffer], { type: 'application/pdf' }), `${title}.pdf`);
    const res = await fetch(`${API}/documents/${documentId}/versions/${versionId}/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) throw new Error(`PDF upload proxy → ${res.status}`);
    viaProxy = true;
  }

  if (!viaProxy) {
    await api(`/documents/${documentId}/versions/${versionId}/complete`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({}),
    });
  }
  return { documentId, versionId };
}

export async function waitForVersionReady(token, documentId, versionId, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  let last = 'unknown';
  while (Date.now() < deadline) {
    const doc = await api(`/documents/${documentId}`, { headers: authHeaders(token) });
    const version = doc.versions?.find((v) => v.id === versionId);
    last = version?.status ?? 'missing';
    if (last === 'ready' || last === 'failed') return version;
    await new Promise((r) => setTimeout(r, 2_000));
  }
  throw new Error(`версия не стала ready за ${timeoutMs / 1000}с, последний статус: ${last}`);
}

export async function waitForPreviews(token, documentId, versionId, expected, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  const want = expected ?? 1;
  let lastStatus = 'unknown';
  let lastCount = 0;
  while (Date.now() < deadline) {
    const res = await api(
      `/presentations/previews?documentId=${documentId}&versionId=${versionId}`,
      { headers: authHeaders(token) },
    );
    lastStatus = res.status ?? 'unknown';
    lastCount = res.pages?.length ?? 0;
    if (lastCount >= want || (res.pageCount && lastCount >= res.pageCount)) return res;
    await new Promise((r) => setTimeout(r, 2_000));
  }
  throw new Error(
    `превью не появились за ${timeoutMs / 1000}с (status=${lastStatus}, страниц=${lastCount}, ждали ${want}). ` +
      'Проверьте, что worker запущен и S3 доступен.',
  );
}
