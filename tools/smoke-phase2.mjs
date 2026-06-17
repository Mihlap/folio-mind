const API = process.env.SMOKE_API_URL ?? 'http://localhost:3001';
const SMOKE_PASSWORD = 'Smoke-test-pass-123';
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS ?? 300_000);
const RAG_FILE = process.env.SMOKE_RAG_FILE;

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
  const res = await fetch(`${API}${path}`, options);
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`${options.method ?? 'GET'} ${path} \u2192 ${res.status}: ${text.slice(0, 300)}`);
  }
  return json;
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function register() {
  const email = `smoke2.${Date.now()}@gmail.com`;
  const data = await api('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: SMOKE_PASSWORD, name: 'Smoke2' }),
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
  const created = await api('/documents', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, fileName: `${title}.pdf`, mimeType: 'application/pdf', size: pdfBuffer.length }),
  });
  const putRes = await fetch(created.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/pdf' },
    body: pdfBuffer,
  });
  if (!putRes.ok) throw new Error(`Presigned PUT failed: ${putRes.status}`);
  await api(`/documents/${created.document.id}/versions/${created.versionId}/complete`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  return { documentId: created.document.id, versionId: created.versionId };
}

async function waitForReady(token, documentId, versionId) {
  const started = Date.now();
  while (Date.now() - started < TIMEOUT_MS) {
    const doc = await api(`/documents/${documentId}`, { headers: { Authorization: `Bearer ${token}` } });
    const version = doc.versions.find((v) => v.id === versionId);
    if (version?.status === 'ready') return version;
    if (version?.status === 'failed') throw new Error('Preview job failed');
    await sleep(2000);
  }
  throw new Error(`Preview timeout after ${TIMEOUT_MS}ms`);
}

function step(name) {
  return {
    ok() { passed++; console.log(`  \u2714 ${name}`); },
    fail(err) { failed++; console.error(`  \u2718 ${name}: ${err.message ?? err}`); },
  };
}

async function main() {
  console.log(`\n=== Folio Mind smoke Phase 2 ===`);
  console.log(`API: ${API}\n`);

  await api('/health');

  /* ---------- auth ---------- */
  console.log('\n[Auth]');
  const { email, data: regData } = await register();
  let token = regData?.token;
  if (!token) {
    await markEmailVerified(email);
    token = await login(email);
  }
  console.log('  \u2714 user registered/logged in');

  /* ---------- upload base PDF ---------- */
  console.log('\n[Upload + preview]');
  const pdf = buildSmokePdf(10);
  const { documentId, versionId } = await uploadDocument(token, pdf, 'smoke-phase2-base');
  const version = await waitForReady(token, documentId, versionId);
  console.log(`  \u2714 uploaded, version ${version.version}, pageCount=${version.pageCount}`);

  /* ---------- integrity badge ---------- */
  console.log('\n[Integrity v1]');
  {
    const s = step('version has integrityStatus');
    if (version.integrityStatus) s.ok();
    else s.fail(new Error('integrityStatus is null/undefined'));
  }
  {
    const s = step('integrity detail endpoint');
    try {
      const detail = await api(`/documents/${documentId}/versions/${versionId}/integrity`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (detail.status && detail.score !== undefined) s.ok();
      else s.fail(new Error('incomplete integrity detail response'));
    } catch (e) { s.fail(e); }
  }

  /* ---------- annotations CRUD ---------- */
  console.log('\n[Annotations CRUD]');
  let createdAnnotationId;
  {
    const s = step('create comment');
    try {
      const ann = await api(`/documents/${documentId}/versions/${versionId}/annotations`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ page: 1, content: 'Smoke test comment', kind: 'comment' }),
      });
      createdAnnotationId = ann.id;
      if (ann.id && ann.page === 1) s.ok();
      else s.fail(new Error('create response missing id/page'));
    } catch (e) { s.fail(e); }
  }
  {
    const s = step('create accepted_edit');
    try {
      const ann = await api(`/documents/${documentId}/versions/${versionId}/annotations`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ page: 1, content: 'new text', quote: 'old text', kind: 'accepted_edit' }),
      });
      if (ann.kind === 'accepted_edit' && ann.quote === 'old text') s.ok();
      else s.fail(new Error('accepted_edit not created correctly'));
    } catch (e) { s.fail(e); }
  }
  {
    const s = step('list annotations');
    try {
      const list = await api(`/documents/${documentId}/versions/${versionId}/annotations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (Array.isArray(list.items) && list.items.length >= 2) s.ok();
      else s.fail(new Error(`expected >=2 items, got ${list.items?.length}`));
    } catch (e) { s.fail(e); }
  }
  {
    const s = step('update annotation');
    try {
      const updated = await api(`/documents/${documentId}/versions/${versionId}/annotations/${createdAnnotationId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Updated smoke comment' }),
      });
      if (updated.content === 'Updated smoke comment') s.ok();
      else s.fail(new Error('update content mismatch'));
    } catch (e) { s.fail(e); }
  }
  {
    const s = step('delete annotation');
    try {
      await api(`/documents/${documentId}/versions/${versionId}/annotations/${createdAnnotationId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      s.ok();
    } catch (e) { s.fail(e); }
  }

  /* ---------- annotation coordinates ---------- */
  console.log('\n[Annotation coordinates]');
  {
    const s = step('create annotation with x,y');
    try {
      const ann = await api(`/documents/${documentId}/versions/${versionId}/annotations`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ page: 2, content: 'Positioned comment', kind: 'comment', x: 150, y: 300 }),
      });
      if (ann.x === 150 && ann.y === 300) s.ok();
      else s.fail(new Error(`x/y mismatch: ${ann.x},${ann.y}`));
    } catch (e) { s.fail(e); }
  }
  {
    const s = step('list returns x,y');
    try {
      const list = await api(`/documents/${documentId}/versions/${versionId}/annotations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const withCoords = list.items.find((a) => a.x != null && a.y != null);
      if (withCoords) s.ok();
      else s.fail(new Error('no annotation with coordinates found'));
    } catch (e) { s.fail(e); }
  }

  /* ---------- PDF operations ---------- */
  console.log('\n[PDF operations]');
  {
    const s = step('upload second version for merge');
    try {
      const pdf2 = buildSmokePdf(5);
      const { versionId: v2 } = await uploadDocument(token, pdf2, 'smoke-phase2-merge-src');
      await waitForReady(token, documentId, v2);
      s.ok();
    } catch (e) { s.fail(e); }
  }
  {
    const s = step('merge versions');
    try {
      const doc = await api(`/documents/${documentId}`, { headers: { Authorization: `Bearer ${token}` } });
      const allIds = doc.versions.map((v) => v.id);
      const result = await api(`/documents/${documentId}/merge`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionIds: allIds }),
      });
      if (result.operationJobId) s.ok();
      else s.fail(new Error('merge did not return operationJobId'));
    } catch (e) { s.fail(e); }
  }
  {
    const s = step('split pages');
    try {
      const result = await api(`/documents/${documentId}/split`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId, pages: [1, 2, 3] }),
      });
      if (result.operationJobId) s.ok();
      else s.fail(new Error('split did not return operationJobId'));
    } catch (e) { s.fail(e); }
  }

  /* ---------- RAG ---------- */
  console.log('\n[RAG]');
  {
    const s = step('upload rag source');
    try {
      const ragContent = RAG_FILE
        ? require('fs').readFileSync(RAG_FILE)
        : Buffer.from('Тестовый регламент: договор должен быть подписан обеими сторонами.', 'utf-8');
      const isPdf = RAG_FILE ? RAG_FILE.endsWith('.pdf') : false;
      const created = await api('/rag/sources', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Smoke regulation', fileName: isPdf ? 'test.pdf' : 'test.txt', mimeType: isPdf ? 'application/pdf' : 'text/plain', size: ragContent.length }),
      });
      const putRes = await fetch(created.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': isPdf ? 'application/pdf' : 'text/plain' },
        body: ragContent,
      });
      if (!putRes.ok) throw new Error(`RAG PUT failed: ${putRes.status}`);
      await api(`/rag/sources/${created.source.id}/complete`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      s.ok();
    } catch (e) { s.fail(e); }
  }
  {
    const s = step('rag query');
    try {
      await sleep(3000);
      const result = await api('/rag/query', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'договор подписан' }),
      });
      if (Array.isArray(result.chunks)) s.ok();
      else s.fail(new Error('rag query did not return chunks array'));
    } catch (e) { s.fail(e); }
  }

  /* ---------- version diff ---------- */
  console.log('\n[Version diff]');
  {
    const s = step('version diff endpoint');
    try {
      const doc = await api(`/documents/${documentId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (doc.versions.length >= 2) {
        const vA = doc.versions[0].id;
        const vB = doc.versions[1].id;
        const diff = await api(`/documents/${documentId}/versions/${vA}/diff/${vB}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (diff && typeof diff === 'object') s.ok();
        else s.fail(new Error('diff response invalid'));
      } else {
        s.fail(new Error('need >=2 versions for diff test'));
      }
    } catch (e) { s.fail(e); }
  }

  /* ---------- summary ---------- */
  const total = passed + failed;
  console.log(`\n\u2500${'\u2500'.repeat(48)}`);
  console.log(`Phase 2 smoke: ${passed}/${total} passed${failed > 0 ? `, ${failed} failed` : ''}\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('\n\u274c Smoke failed:', err.message ?? err);
  process.exit(1);
});
