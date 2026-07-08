const API = process.env.SMOKE_API_URL ?? 'http://localhost:3001';
const PAGE_COUNT = Number(process.env.SMOKE_PAGES ?? 60);
const PARALLEL = Number(process.env.SMOKE_PARALLEL ?? 1);
const PREVIEW_TIMEOUT_MS = Number(process.env.SMOKE_PREVIEW_TIMEOUT_MS ?? 180_000);
const META_SAMPLES = Number(process.env.SMOKE_META_SAMPLES ?? 20);
const P95_LIMIT_MS = Number(process.env.SMOKE_P95_LIMIT_MS ?? 500);
const SMOKE_PASSWORD = 'Smoke-test-pass-123';

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
    );
    pageParts.push(
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

function p95(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[idx];
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
    throw new Error(`${options.method ?? 'GET'} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  }
  return json;
}

async function register() {
  const email = `smoke.${Date.now()}@gmail.com`;
  const data = await api('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: SMOKE_PASSWORD, name: 'Smoke' }),
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
  if (!data?.token) {
    throw new Error('Login did not return JWT token');
  }
  return data.token;
}

async function uploadDocument(token, pdfBuffer, title) {
  const created = await api('/documents', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title,
      fileName: `${title}.pdf`,
      mimeType: 'application/pdf',
      size: pdfBuffer.length,
    }),
  });

  const putRes = await fetch(created.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/pdf' },
    body: pdfBuffer,
  });
  if (!putRes.ok) {
    throw new Error(`Presigned PUT failed: ${putRes.status}`);
  }

  await api(`/documents/${created.document.id}/versions/${created.versionId}/complete`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  return {
    documentId: created.document.id,
    versionId: created.versionId,
  };
}

async function waitForReady(token, documentId, versionId) {
  const started = Date.now();
  while (Date.now() - started < PREVIEW_TIMEOUT_MS) {
    const doc = await api(`/documents/${documentId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const version = doc.versions.find((v) => v.id === versionId);
    if (version?.status === 'ready') return version;
    if (version?.status === 'failed') {
      throw new Error('Preview job failed (version status=failed)');
    }
    await sleep(2000);
  }
  throw new Error(`Preview timeout after ${PREVIEW_TIMEOUT_MS}ms`);
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function measureMetaLatency(token, documentId) {
  const listTimes = [];
  const getTimes = [];

  for (let i = 0; i < META_SAMPLES; i++) {
    let t0 = performance.now();
    await api('/documents?limit=20', {
      headers: { Authorization: `Bearer ${token}` },
    });
    listTimes.push(performance.now() - t0);

    t0 = performance.now();
    await api(`/documents/${documentId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    getTimes.push(performance.now() - t0);
  }

  return {
    listP95: p95(listTimes),
    getP95: p95(getTimes),
  };
}

async function waitForPreviewRange(token, documentId, versionId, toPage) {
  const deadline = Date.now() + PREVIEW_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const previews = await api(
      `/documents/${documentId}/versions/${versionId}/previews?from=1&to=${toPage}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (previews.pageCount >= toPage && previews.pages?.length >= toPage) {
      return previews;
    }
    await sleep(2000);
  }
  throw new Error(`Lazy preview timeout (expected ${toPage} thumbnails)`);
}

async function runOneUpload(token, pdfBuffer, index) {
  const title = `smoke-${PAGE_COUNT}p-${index}`;
  const started = performance.now();
  const { documentId, versionId } = await uploadDocument(token, pdfBuffer, title);
  await waitForReady(token, documentId, versionId);

  const targetThumbs = Math.min(PAGE_COUNT, 60);
  const previews = await waitForPreviewRange(token, documentId, versionId, targetThumbs);

  const fileRes = await fetch(`${API}/documents/${documentId}/versions/${versionId}/file`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!fileRes.ok) {
    throw new Error(`file download failed: ${fileRes.status}`);
  }
  const fileBytes = await fileRes.arrayBuffer();

  return {
    documentId,
    versionId,
    elapsedMs: Math.round(performance.now() - started),
    pageCount: previews.pageCount,
    previewPages: previews.pages?.length ?? 0,
    fileSize: fileBytes.byteLength,
    previewsStatus: previews.status,
  };
}

async function main() {
  console.log(`\n=== Folio Mind smoke Phase 1 ===`);
  console.log(`API: ${API}`);
  console.log(`Pages: ${PAGE_COUNT}, parallel uploads: ${PARALLEL}\n`);

  if (PAGE_COUNT < 50) {
    console.error('SMOKE_PAGES must be >= 50 for ROADMAP §1.7');
    process.exit(1);
  }

  await api('/health');

  const pdf = buildSmokePdf(PAGE_COUNT);
  console.log(`Generated PDF: ${PAGE_COUNT} pages, ${pdf.length} bytes`);

  const { email, data } = await register();
  let token = data?.token;
  if (!token) {
    await markEmailVerified(email);
    token = await login(email);
  }
  console.log('Registered smoke user');

  const results = [];
  if (PARALLEL <= 1) {
    results.push(await runOneUpload(token, pdf, 1));
  } else {
    const batch = await Promise.all(
      Array.from({ length: PARALLEL }, (_, i) => runOneUpload(token, pdf, i + 1)),
    );
    results.push(...batch);
  }

  for (const r of results) {
    console.log(
      `  doc ${r.documentId}: preview ${r.elapsedMs}ms, pageCount=${r.pageCount}, thumbs=${r.previewPages}, file=${r.fileSize}B`,
    );
    if (r.pageCount < 50) {
      throw new Error(`pageCount ${r.pageCount} < 50`);
    }
    if (r.previewPages < 50) {
      throw new Error(
        `preview thumbnails ${r.previewPages} < 50 (lazy generation; check worker PREVIEW_MAX_PAGES)`,
      );
    }
    if (r.fileSize < 1000) {
      throw new Error('downloaded PDF too small');
    }
  }

  const meta = await measureMetaLatency(token, results[0].documentId);
  console.log(
    `\nAPI latency p95: GET /documents ${meta.listP95.toFixed(0)} ms, GET /documents/:id ${meta.getP95.toFixed(0)} ms`,
  );

  const failedMeta = meta.listP95 > P95_LIMIT_MS || meta.getP95 > P95_LIMIT_MS;
  if (failedMeta) {
    console.warn(`WARN: p95 above ${P95_LIMIT_MS} ms target (dev machine may be slow)`);
  }

  console.log('\n✅ Smoke Phase 1 passed: upload + preview + viewer file on 50+ pages\n');
}

main().catch((err) => {
  console.error('\n❌ Smoke failed:', err.message ?? err);
  process.exit(1);
});
