import { checkApiHealth, uploadPdfWithOptionalDocx } from './smoke-upload.mjs';

const API = process.env.SMOKE_API_URL ?? 'http://localhost:3001';
const GOTENBERG_URL = process.env.GOTENBERG_URL ?? 'http://localhost:3003';
const PDF_TO_DOCX_URL = process.env.PDF_TO_DOCX_URL ?? 'http://localhost:8080';
const SMOKE_PASSWORD = 'Smoke-test-pass-123';
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS ?? 300_000);

let passed = 0;
let failed = 0;

function esc(s) {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function buildSmokePdf(totalPages) {
  const kids = [];
  const pageParts = [];
  let nextId = 4;
  for (let p = 1; p <= totalPages; p++) {
    const pageId = nextId++;
    const contentId = nextId++;
    kids.push(`${pageId} 0 R`);
    const stream = `BT /F1 14 Tf 50 800 Td (${esc(`Smoke page ${p}/${totalPages}`)}) Tj ET\n`;
    const len = Buffer.byteLength(stream, 'utf8');
    pageParts.push(
      `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${contentId} 0 R /Resources << /Font << /F1 3 0 R >> >> >>\nendobj\n`,
      `${contentId} 0 obj\n<< /Length ${len} >>\nstream\n${stream}endstream\nendobj\n`,
    );
  }
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    `2 0 obj\n<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${totalPages} >>\nendobj\n`,
    '3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    ...pageParts,
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
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      ...options,
      signal: options.signal ?? AbortSignal.timeout(30_000),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`${options.method ?? 'GET'} ${path} → ${msg}`);
  }
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`${options.method ?? 'GET'} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  }
  return json;
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function register() {
  const email = `smoke3p2d.${Date.now()}@gmail.com`;
  const data = await api('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: SMOKE_PASSWORD, name: 'Smoke3P2D' }),
  });
  return { email, data };
}

async function markEmailVerified(email) {
  const { createRequire } = await import('node:module');
  const serverRequire = createRequire(new URL('../apps/server/package.json', import.meta.url));
  const { PrismaClient } = serverRequire('@prisma/client');
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

async function login(email) {
  const data = await api('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: SMOKE_PASSWORD }),
  });
  if (!data?.token) throw new Error('Login did not return JWT token');
  return data.token;
}

async function uploadDocument(token, pdfBuffer, title) {
  return uploadPdfWithOptionalDocx({
    apiBase: API,
    apiCall: api,
    token,
    pdfBuffer,
    docxBuffer: null,
    title,
    withDocx: false,
  });
}

async function waitForReady(token, documentId, versionId) {
  const started = Date.now();
  while (Date.now() - started < TIMEOUT_MS) {
    const doc = await api(`/documents/${documentId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const version = doc.versions.find((v) => v.id === versionId);
    if (version?.status === 'ready') return version;
    if (version?.status === 'failed') throw new Error('Version processing failed');
    await sleep(2000);
  }
  throw new Error(`Version timeout after ${TIMEOUT_MS}ms`);
}

async function waitForJob(token, jobId) {
  const started = Date.now();
  while (Date.now() - started < TIMEOUT_MS) {
    const job = await api(`/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (job.status === 'completed') return job;
    if (job.status === 'failed') throw new Error(`Job failed: ${JSON.stringify(job.payload)}`);
    await sleep(2000);
  }
  throw new Error(`Job timeout after ${TIMEOUT_MS}ms`);
}

function step(name) {
  return {
    ok() {
      passed++;
      console.log(`  ✔ ${name}`);
    },
    fail(err) {
      failed++;
      console.error(`  ✘ ${name}: ${err.message ?? err}`);
    },
  };
}

async function checkHealth(name, url) {
  const s = step(name);
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (res.ok) s.ok();
    else s.fail(new Error(`HTTP ${res.status}`));
  } catch (e) {
    s.fail(e);
    return false;
  }
  return true;
}

async function main() {
  console.log('\n=== Folio Mind smoke Phase 3 pdf2docx (PDF-only path) ===');
  console.log(`API: ${API}`);
  console.log(`Gotenberg: ${GOTENBERG_URL}`);
  console.log(`pdf2docx: ${PDF_TO_DOCX_URL}\n`);

  const gotenbergOk = await checkHealth('Gotenberg health', `${GOTENBERG_URL}/health`);
  const pdf2docxOk = await checkHealth('pdf2docx health', `${PDF_TO_DOCX_URL}/health`);
  if (!gotenbergOk || !pdf2docxOk) {
    console.error('\nЗапустите: docker compose up gotenberg pdf2docx -d');
    process.exit(1);
  }

  await checkApiHealth(API);

  console.log('\n[Auth]');
  const { email, data: regData } = await register();
  let token = regData?.token;
  if (!token) {
    await markEmailVerified(email);
    token = await login(email);
  }
  console.log('  ✔ user registered/logged in');

  console.log('\n[Upload PDF-only]');
  const pdf = buildSmokePdf(3);
  const { documentId, versionId } = await uploadDocument(token, pdf, 'smoke-phase3-pdf2docx');
  {
    const s = step('v1 ready without sourceDocxKey');
    const v1 = await waitForReady(token, documentId, versionId);
    if (!v1.sourceDocxKey) s.ok();
    else s.fail(new Error(`unexpected sourceDocxKey=${v1.sourceDocxKey}`));
  }

  const pageOneText = 'Smoke page 1/3';
  const updatedText = 'Updated smoke page 1';

  console.log('\n[Accepted edit]');
  {
    const s = step('create accepted_edit');
    try {
      await api(`/documents/${documentId}/versions/${versionId}/annotations`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          page: 1,
          content: updatedText,
          quote: pageOneText,
          kind: 'accepted_edit',
        }),
      });
      s.ok();
    } catch (e) {
      s.fail(e);
    }
  }

  console.log('\n[Apply edits final — pdf2docx path]');
  let targetVersionId;
  let operationJobId;
  {
    const s = step('POST apply-edits-final');
    try {
      const result = await api(
        `/documents/${documentId}/versions/${versionId}/operations/apply-edits-final`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        },
      );
      operationJobId = result.operationJobId;
      targetVersionId = result.versionId;
      if (operationJobId && targetVersionId) s.ok();
      else s.fail(new Error('missing operationJobId or versionId'));
    } catch (e) {
      s.fail(e);
    }
  }

  if (operationJobId) {
    const s = step('job method=docx-converted, applied>=1');
    try {
      const job = await waitForJob(token, operationJobId);
      const p = job.payload ?? {};
      if (p.method === 'docx-converted' && (p.applied ?? 0) >= 1) s.ok();
      else s.fail(new Error(`method=${p.method}, applied=${p.applied}`));
    } catch (e) {
      s.fail(e);
    }
  }

  if (targetVersionId) {
    const s = step('v2 ready with hasAppliedDocx');
    try {
      await waitForReady(token, documentId, targetVersionId);
      const doc = await api(`/documents/${documentId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const v2 = doc.versions.find((v) => v.id === targetVersionId);
      if (v2?.hasAppliedDocx) s.ok();
      else s.fail(new Error(`hasAppliedDocx=${v2?.hasAppliedDocx}`));
    } catch (e) {
      s.fail(e);
    }
  }

  const total = passed + failed;
  console.log(`\n${'─'.repeat(49)}`);
  console.log(
    `Phase 3 pdf2docx smoke: ${passed}/${total} passed${failed > 0 ? `, ${failed} failed` : ''}\n`,
  );
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('\n❌ Smoke failed:', err.message ?? err);
  process.exit(1);
});
