const API = process.env.SMOKE_API_URL ?? 'http://localhost:3001';
const PASS = 'Smoke-test-pass-123';

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 400)}`);
  return data;
}

async function main() {
  const email = `project-smoke.${Date.now()}@gmail.com`;

  await api('/auth/register', {
    method: 'POST',
    body: { email, password: PASS, name: 'Project Smoke' },
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

  const login = await api('/auth/login', { method: 'POST', body: { email, password: PASS } });
  const token = login.token;
  if (!token) throw new Error('login missing token');
  console.log('logged in', email);

  const project = await api('/projects', {
    method: 'POST',
    token,
    body: { name: 'Smoke Test Project' },
  });
  console.log('project created', project.id, project.name);

  const list = await api('/projects', { token });
  if (!list.items.some((p) => p.id === project.id)) {
    throw new Error('project not in list');
  }

  const detail = await api(`/projects/${project.id}`, { token });
  if (detail.project.id !== project.id) throw new Error('project detail mismatch');
  console.log('project detail docs', detail.documents.length);

  const pdfBytes = Buffer.from(
    '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n',
    'utf8',
  );
  const created = await api('/documents', {
    method: 'POST',
    token,
    body: {
      title: 'project-doc',
      fileName: 'test.pdf',
      mimeType: 'application/pdf',
      size: pdfBytes.length,
      projectId: project.id,
    },
  });
  if (created.document.projectId !== project.id) {
    throw new Error('document not created in project');
  }
  console.log('document in project', created.document.id);

  const detail2 = await api(`/projects/${project.id}`, { token });
  if (detail2.documents.length < 1) throw new Error('document not listed in project');

  const unassigned = await api(`/documents/${created.document.id}/project`, {
    method: 'PATCH',
    token,
    body: { projectId: null },
  });
  if (unassigned.projectId !== null) throw new Error('unassign failed');
  console.log('document unassigned');

  await api(`/projects/${project.id}`, { method: 'DELETE', token });
  console.log('OK project smoke');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
