const UPLOAD_TIMEOUT_MS = Number(process.env.SMOKE_UPLOAD_TIMEOUT_MS ?? 45_000);
const PROXY_TIMEOUT_MS = Number(process.env.SMOKE_PROXY_TIMEOUT_MS ?? 120_000);

export async function checkApiHealth(apiBase) {
  try {
    const res = await fetch(`${apiBase}/health`, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `API ${apiBase}/health недоступен (${msg}). Запустите: pnpm dev (server :3001).`,
    );
  }
}

async function readResponse(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { raw: text };
  }
}

export async function putPresignedOrThrow(uploadUrl, buffer, contentType, label) {
  let host = uploadUrl;
  try {
    host = new URL(uploadUrl).host;
  } catch {}
  try {
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: buffer,
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return 'presigned';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`${label}: PUT в S3 (${host}) — ${msg}`);
  }
}

export async function postMultipartProxy(url, token, buffer, contentType, filename) {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: contentType }), filename);
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`proxy POST ${url} — ${msg}`);
  }
  const json = await readResponse(res);
  if (!res.ok) {
    throw new Error(`proxy POST ${url} → ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
  }
  return json;
}

export async function uploadPdfWithOptionalDocx(params) {
  const {
    apiBase,
    apiCall,
    token,
    pdfBuffer,
    docxBuffer,
    title,
    withDocx,
  } = params;

  const created = await apiCall('/documents', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title,
      fileName: `${title}.pdf`,
      mimeType: 'application/pdf',
      size: pdfBuffer.length,
      ...(withDocx ? { docxFileName: `${title}.docx` } : {}),
    }),
  });

  const documentId = created.document.id;
  const versionId = created.versionId;
  const pdfProxyUrl = `${apiBase}/documents/${documentId}/versions/${versionId}/upload`;
  const docxProxyUrl = `${apiBase}/documents/${documentId}/versions/${versionId}/source-docx-upload`;

  if (withDocx) {
    if (!created.docxUploadUrl) throw new Error('API did not return docxUploadUrl');
    try {
      await putPresignedOrThrow(
        created.docxUploadUrl,
        docxBuffer,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'DOCX',
      );
    } catch (presignedErr) {
      console.warn(`  ⚠ ${presignedErr.message} → proxy DOCX`);
      await postMultipartProxy(
        docxProxyUrl,
        token,
        docxBuffer,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        `${title}.docx`,
      );
    }
  }

  let pdfViaProxy = false;
  try {
    await putPresignedOrThrow(created.uploadUrl, pdfBuffer, 'application/pdf', 'PDF');
  } catch (presignedErr) {
    console.warn(`  ⚠ ${presignedErr.message} → proxy PDF`);
    await postMultipartProxy(
      pdfProxyUrl,
      token,
      pdfBuffer,
      'application/pdf',
      `${title}.pdf`,
    );
    pdfViaProxy = true;
  }

  if (!pdfViaProxy) {
    await apiCall(`/documents/${documentId}/versions/${versionId}/complete`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
  }

  return {
    documentId,
    versionId,
    sourceDocxKey: created.docxS3Key,
  };
}
