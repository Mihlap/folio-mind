/**
 * Smoke: длинный PDF → индекс чанков → RAG-чат с источниками (цитатой).
 *
 * Требует: API + worker + S3 + Postgres (+ настроенный AI_PROVIDER для полного ответа).
 * Env:
 *   SMOKE_API_URL (default http://localhost:3001)
 *   SMOKE_PAGES (default 120)
 *   SMOKE_MARKER_PAGE (default 87)
 *   SMOKE_CHAT_TIMEOUT_MS (default 180000)
 *   SMOKE_INDEX_TIMEOUT_MS (default 180000)
 */
const API = process.env.SMOKE_API_URL ?? 'http://localhost:3001';
const PAGE_COUNT = Number(process.env.SMOKE_PAGES ?? 120);
const MARKER_PAGE = Number(process.env.SMOKE_MARKER_PAGE ?? 87);
const INDEX_TIMEOUT_MS = Number(process.env.SMOKE_INDEX_TIMEOUT_MS ?? 180_000);
const CHAT_TIMEOUT_MS = Number(process.env.SMOKE_CHAT_TIMEOUT_MS ?? 180_000);
const PREVIEW_TIMEOUT_MS = Number(process.env.SMOKE_PREVIEW_TIMEOUT_MS ?? 180_000);
const SMOKE_PASSWORD = 'Smoke-test-pass-123';
/** Латиница: Type1 Helvetica в synthetic PDF не держит кириллицу для extract. */
const MARKER = 'ALPHA-MARKER-8841';
const MARKER_CLAUSE = `Article 17. Special late-payment penalty ${MARKER} equals 0.1 percent per each day of delay.`;

function esc(s) {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function buildLongContractPdf(totalPages, markerPage) {
  if (markerPage < 1 || markerPage > totalPages) {
    throw new Error(`SMOKE_MARKER_PAGE=${markerPage} вне диапазона 1..${totalPages}`);
  }
  const kids = [];
  const pageParts = [];
  let nextId = 4;

  for (let p = 1; p <= totalPages; p++) {
    const pageId = nextId++;
    const contentId = nextId++;
    kids.push(`${pageId} 0 R`);
    const lines =
      p === markerPage
        ? [
            `Page ${p} of ${totalPages}.`,
            MARKER_CLAUSE,
            'This clause prevails over general terms in section 3.',
          ]
        : [
            `Page ${p} of ${totalPages}.`,
            `General contract terms. Section ${(p % 12) + 1}. Clause ${p}.1.`,
            'Parties shall keep confidentiality and meet delivery deadlines.',
          ];
    const stream =
      'BT /F1 12 Tf 50 800 Td ' +
      lines.map((line, i) => (i === 0 ? `(${esc(line)}) Tj` : `0 -18 Td (${esc(line)}) Tj`)).join(' ') +
      ' ET\n';
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

async function register() {
  const email = `smoke.rag.${Date.now()}@gmail.com`;
  await api('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: SMOKE_PASSWORD, name: 'Smoke RAG' }),
  });
  return email;
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
  if (!putRes.ok) throw new Error(`Presigned PUT failed: ${putRes.status}`);

  await api(`/documents/${created.document.id}/versions/${created.versionId}/complete`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  return { documentId: created.document.id, versionId: created.versionId };
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

async function waitForChunks(versionId, minCount = 3) {
  const { createRequire } = await import('node:module');
  const serverRequire = createRequire(new URL('../apps/server/package.json', import.meta.url));
  const { PrismaClient } = serverRequire('@prisma/client');
  const prisma = new PrismaClient();
  const started = Date.now();
  try {
    while (Date.now() - started < INDEX_TIMEOUT_MS) {
      const count = await prisma.documentChunk.count({ where: { versionId } });
      if (count >= minCount) {
        const withMarker = await prisma.documentChunk.count({
          where: { versionId, content: { contains: MARKER } },
        });
        return { count, withMarker };
      }
      await sleep(2000);
    }
    throw new Error(`DocumentChunk index timeout (need >= ${minCount}) after ${INDEX_TIMEOUT_MS}ms`);
  } finally {
    await prisma.$disconnect();
  }
}

async function waitForJob(token, jobId) {
  const started = Date.now();
  while (Date.now() - started < CHAT_TIMEOUT_MS) {
    const job = await api(`/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (job.status === 'completed' || job.status === 'failed') return job;
    await sleep(2000);
  }
  throw new Error(`AI chat timeout after ${CHAT_TIMEOUT_MS}ms`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  console.log(`smoke-rag-chat: pages=${PAGE_COUNT} markerPage=${MARKER_PAGE} api=${API}`);
  assert(PAGE_COUNT >= 100, 'SMOKE_PAGES must be >= 100 (критерий спринта 11)');

  const email = await register();
  await markEmailVerified(email);
  const token = await login(email);

  const pdf = buildLongContractPdf(PAGE_COUNT, MARKER_PAGE);
  const title = `smoke-rag-${PAGE_COUNT}p`;
  const { documentId, versionId } = await uploadDocument(token, pdf, title);
  console.log(`uploaded documentId=${documentId} versionId=${versionId}`);

  await waitForReady(token, documentId, versionId);
  console.log('version ready');

  const index = await waitForChunks(versionId, 3);
  console.log(`chunks=${index.count} withMarker=${index.withMarker}`);
  assert(index.withMarker >= 1, `Индекс не содержит маркер ${MARKER}`);

  const prompt =
    'What is the late-payment penalty rate in Article 17? Mention ALPHA-MARKER if present. Answer briefly and cite the page.';
  const queued = await api(`/documents/${documentId}/versions/${versionId}/ai/chat`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt }),
  });
  assert(queued?.jobId, 'ai/chat не вернул jobId');
  console.log(`chat jobId=${queued.jobId}`);

  const job = await waitForJob(token, queued.jobId);
  if (job.status === 'failed') {
    const err = job.payload?.error ?? 'unknown';
    throw new Error(`AI chat failed: ${err}`);
  }

  const payload = job.payload ?? {};
  const reply = String(payload.reply ?? '');
  const chatMode = payload.chatMode;
  const sources = Array.isArray(payload.sources) ? payload.sources : [];

  console.log(`chatMode=${chatMode} sources=${sources.length} replyLen=${reply.length}`);
  assert(reply.trim().length > 0, 'Пустой reply');
  assert(chatMode === 'rag', `Ожидали chatMode=rag, получили ${chatMode}`);
  assert(sources.length > 0, 'Нет sources (цитат) в ответе RAG-чата');

  const sourceHit = sources.some(
    (s) =>
      (typeof s.excerpt === 'string' && s.excerpt.includes(MARKER)) ||
      s.page === MARKER_PAGE,
  );
  assert(sourceHit, `Sources не содержат маркер ${MARKER} и/или стр. ${MARKER_PAGE}`);

  const replyLooksRelevant =
    reply.includes(MARKER) ||
    /0[,.]1/.test(reply) ||
    /penalt/i.test(reply) ||
    /Article\s*17/i.test(reply) ||
    reply.includes(String(MARKER_PAGE));
  assert(replyLooksRelevant, 'Ответ LLM не похож на содержание Article 17');

  console.log('smoke-rag-chat: OK');
}

main().catch((err) => {
  console.error('smoke-rag-chat: FAIL', err instanceof Error ? err.message : err);
  process.exit(1);
});
