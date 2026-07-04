import { checkApiHealth, uploadPdfWithOptionalDocx } from './smoke-upload.mjs';

const API = process.env.SMOKE_API_URL ?? 'http://localhost:3001';
const PASS = 'Smoke-test-pass-123';
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS ?? 300_000);

function esc(s) {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function buildDuplicateTokenPdf() {
  const stream =
    `BT /F1 14 Tf 50 800 Td (${esc('TOKEN')}) Tj ET\n` +
    `BT /F1 14 Tf 50 100 Td (${esc('TOKEN')}) Tj ET\n`;
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

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, options);
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) throw new Error(`${options.method ?? 'GET'} ${path} → ${res.status}: ${text.slice(0, 400)}`);
  return json;
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function waitForVersion(token, documentId, versionId) {
  const started = Date.now();
  while (Date.now() - started < TIMEOUT_MS) {
    const doc = await api(`/documents/${documentId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const v = doc.versions.find((x) => x.id === versionId);
    if (v?.status === 'ready') return v;
    if (v?.status === 'failed') throw new Error('version failed');
    await sleep(2000);
  }
  throw new Error('version timeout');
}

async function waitForJob(token, jobId) {
  const started = Date.now();
  while (Date.now() - started < TIMEOUT_MS) {
    const job = await api(`/jobs/${jobId}`, { headers: { Authorization: `Bearer ${token}` } });
    if (job.status === 'completed') return job;
    if (job.status === 'failed') throw new Error(`job failed: ${JSON.stringify(job.payload)}`);
    await sleep(2000);
  }
  throw new Error('job timeout');
}

async function main() {
  await checkApiHealth(API);
  const email = `coords-smoke.${Date.now()}@gmail.com`;
  await api('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASS, name: 'Coords Smoke' }),
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

  const pdf = buildDuplicateTokenPdf();
  const { documentId, versionId } = await uploadPdfWithOptionalDocx({
    apiBase: API,
    apiCall: (path, opts) =>
      api(path, { ...opts, headers: { ...opts.headers, Authorization: `Bearer ${token}` } }),
    token,
    pdfBuffer: pdf,
    docxBuffer: null,
    title: 'coords-smoke',
    withDocx: false,
  });
  await waitForVersion(token, documentId, versionId);
  console.log('PDF ready');

  const pageW = 595;
  const pageH = 842;

  await api(`/documents/${documentId}/versions/${versionId}/annotations`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      page: 1,
      kind: 'accepted_edit',
      quote: 'TOKEN',
      content: 'TOP-OK',
      x: pageW * 0.15,
      y: pageH * 0.12,
      pageWidthPx: pageW,
      pageHeightPx: pageH,
    }),
  });

  await api(`/documents/${documentId}/versions/${versionId}/annotations`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      page: 1,
      kind: 'accepted_edit',
      quote: 'TOKEN',
      content: 'BOT-OK',
      x: pageW * 0.15,
      y: pageH * 0.88,
      pageWidthPx: pageW,
      pageHeightPx: pageH,
    }),
  });
  console.log('2 anchored edits created');

  const apply = await api(
    `/documents/${documentId}/versions/${versionId}/operations/apply-edits-final`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    },
  );
  const job = await waitForJob(token, apply.operationJobId);
  const applied = job.payload?.applied;
  const failed = job.payload?.failed;
  console.log('apply-edits', { applied, failed, method: job.payload?.method });

  if (typeof applied !== 'number' || applied < 1) {
    throw new Error(`expected applied >= 1, got ${applied}`);
  }
  console.log('OK coords smoke');
}

main().catch((e) => {
  console.error('FAIL', e.message ?? e);
  process.exit(1);
});
