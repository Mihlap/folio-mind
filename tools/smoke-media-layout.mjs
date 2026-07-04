import { checkApiHealth, uploadPdfWithOptionalDocx } from './smoke-upload.mjs';

const API = process.env.SMOKE_API_URL ?? 'http://localhost:3001';
const PASS = 'Smoke-test-pass-123';
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS ?? 300_000);

function esc(s) {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function buildSmokePdf() {
  const stream = `BT /F1 14 Tf 50 800 Td (${esc('Layout smoke page')}) Tj ET\n`;
  const len = Buffer.byteLength(stream, 'utf8');
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
    `4 0 obj\n<< /Length ${len} >>\nstream\n${stream}endstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
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

function tinyPng() {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
}

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
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  await checkApiHealth(API);
  const email = `media-layout.${Date.now()}@gmail.com`;
  await api('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASS, name: 'Media Layout Smoke' }),
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
  console.log('logged in', email);

  const pdf = buildSmokePdf();
  const { documentId, versionId } = await uploadPdfWithOptionalDocx({
    apiBase: API,
    apiCall: (path, opts) =>
      api(path, {
        ...opts,
        headers: { ...opts.headers, Authorization: `Bearer ${token}` },
      }),
    token,
    pdfBuffer: pdf,
    docxBuffer: null,
    title: 'layout-smoke',
    withDocx: false,
  });

  const started = Date.now();
  while (Date.now() - started < TIMEOUT_MS) {
    const doc = await api(`/documents/${documentId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const version = doc.versions.find((v) => v.id === versionId);
    if (version?.status === 'ready') break;
    if (version?.status === 'failed') throw new Error('PDF version failed');
    await sleep(2000);
  }
  console.log('PDF ready', versionId);

  const png = tinyPng();
  const created = await api('/media-assets', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: 'layout-stamp.png',
      mimeType: 'image/png',
      size: png.length,
      width: 1,
      height: 1,
    }),
  });
  const form = new FormData();
  form.append('file', new Blob([png], { type: 'image/png' }), 'layout-stamp.png');
  const uploadRes = await fetch(`${API}/media-assets/${created.id}/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!uploadRes.ok) throw new Error(`media upload ${uploadRes.status}`);
  console.log('media ready', created.id);

  const contentRes = await fetch(`${API}/media-assets/${created.id}/content`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!contentRes.ok) throw new Error(`media content ${contentRes.status}`);
  const contentBuf = Buffer.from(await contentRes.arrayBuffer());
  const dataUrl = `data:image/png;base64,${contentBuf.toString('base64')}`;

  const layout = await api(
    `/documents/${documentId}/versions/${versionId}/operations/apply-layout-pdf`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        objects: [
          {
            id: 'media-stamp-1',
            page: 1,
            rect: { x: 0.1, y: 0.1, width: 0.15, height: 0.15 },
            imageSrc: dataUrl,
            rotation: 0,
          },
        ],
      }),
    },
  );
  console.log('layout job', layout.operationJobId, '→ v', layout.version);

  const jobStarted = Date.now();
  while (Date.now() - jobStarted < TIMEOUT_MS) {
    const job = await api(`/jobs/${layout.operationJobId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (job.status === 'completed') break;
    if (job.status === 'failed') throw new Error(`layout job failed: ${JSON.stringify(job.payload)}`);
    await sleep(2000);
  }

  const docAfter = await api(`/documents/${documentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const newVersion = docAfter.versions.find((v) => v.id === layout.versionId);
  if (!newVersion) throw new Error('new version missing');
  if (newVersion.status !== 'ready') {
    const waitStart = Date.now();
    while (Date.now() - waitStart < TIMEOUT_MS) {
      const d = await api(`/documents/${documentId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const v = d.versions.find((x) => x.id === layout.versionId);
      if (v?.status === 'ready') break;
      if (v?.status === 'failed') throw new Error('layout version failed');
      await sleep(2000);
    }
  }
  console.log('OK media layout smoke: v' + layout.version + ' ready');
}

main().catch((e) => {
  console.error('FAIL', e.message ?? e);
  process.exit(1);
});
