const API = process.env.SMOKE_API_URL ?? 'http://localhost:3001';
const PASS = 'Smoke-test-pass-123';
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS ?? 120_000);

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

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function buildSmokePdf() {
  const stream = 'BT /F1 14 Tf 50 800 Td (Guest comment smoke) Tj ET\n';
  const len = Buffer.byteLength(stream, 'utf8');
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [4 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    `4 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 5 0 R /Resources << /Font << /F1 3 0 R >> >> >>\nendobj\n`,
    `5 0 obj\n<< /Length ${len} >>\nstream\n${stream}endstream\nendobj\n`,
  ];
  let body = '%PDF-1.4\n';
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(body, 'utf8'));
    body += obj;
  }
  const xrefStart = Buffer.byteLength(body, 'utf8');
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    body += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(body, 'utf8');
}

async function main() {
  const email = `guest-comment-smoke.${Date.now()}@gmail.com`;
  await api('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASS, name: 'Guest Comment Smoke' }),
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

  const pdf = buildSmokePdf();
  const created = await api('/documents', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Guest comment smoke',
      fileName: 'guest-comment-smoke.pdf',
      mimeType: 'application/pdf',
      size: pdf.length,
    }),
  });
  const putRes = await fetch(created.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/pdf' },
    body: pdf,
  });
  if (!putRes.ok) throw new Error(`upload PUT ${putRes.status}`);

  await api(`/documents/${created.document.id}/versions/${created.versionId}/complete`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });

  const started = Date.now();
  let versionReady = false;
  while (Date.now() - started < TIMEOUT_MS) {
    const doc = await api(`/documents/${created.document.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const version = doc.versions.find((v) => v.id === created.versionId);
    if (version?.status === 'ready') {
      versionReady = true;
      break;
    }
    if (version?.status === 'failed') throw new Error('version processing failed');
    await sleep(2000);
  }
  if (!versionReady) throw new Error('version not ready in time');

  const share = await api(`/documents/${created.document.id}/share-links`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ versionId: created.versionId, ttl: '7d' }),
  });
  const shareToken = share.url.split('/share/')[1]?.split(/[?#]/)[0];
  if (!shareToken) throw new Error('share token missing in url');

  const comment = await api(`/public/share/${shareToken}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      page: 1,
      content: 'Smoke: замечание от заказчика',
      authorName: 'Smoke Guest',
    }),
  });
  console.log('guest comment created', comment.id);

  const listed = await api(
    `/documents/${created.document.id}/versions/${created.versionId}/guest-comments`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!listed.items?.some((item) => item.id === comment.id)) {
    throw new Error('comment not visible to owner');
  }

  console.log('OK guest comment smoke: create + owner list');
}

main().catch((err) => {
  console.error('FAIL', err.message);
  process.exit(1);
});
