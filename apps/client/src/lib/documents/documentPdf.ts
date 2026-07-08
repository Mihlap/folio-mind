import { apiBaseUrl } from '@folio-mind/store';

const PDF_BYTES_CACHE_MAX = 6;
const PDF_BYTES_CACHE_MAX_BYTES = 12 * 1024 * 1024;
const SESSION_CACHE_PREFIX = 'folio-pdf:';
const pdfBytesCache = new Map<string, Uint8Array>();
const inflightPdfLoads = new Map<string, Promise<Uint8Array>>();

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function cachePdfBytes(key: string, bytes: Uint8Array): void {
  if (bytes.byteLength > PDF_BYTES_CACHE_MAX_BYTES) return;
  if (pdfBytesCache.has(key)) pdfBytesCache.delete(key);
  pdfBytesCache.set(key, bytes);
  while (pdfBytesCache.size > PDF_BYTES_CACHE_MAX) {
    const oldest = pdfBytesCache.keys().next().value;
    if (oldest) pdfBytesCache.delete(oldest);
  }
  try {
    if (bytes.byteLength <= 2 * 1024 * 1024) {
      const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
      sessionStorage.setItem(`${SESSION_CACHE_PREFIX}${key}`, btoa(binary));
    }
  } catch {
  }
}

function readSessionCache(key: string): Uint8Array | null {
  try {
    const encoded = sessionStorage.getItem(`${SESSION_CACHE_PREFIX}${key}`);
    if (!encoded) return null;
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}

export function getCachedPdfBytes(documentId: string, versionId: string): Uint8Array | null {
  const key = `${documentId}/${versionId}`;
  const cached = pdfBytesCache.get(key);
  if (cached) return cached.slice();
  const fromSession = readSessionCache(key);
  if (fromSession) {
    cachePdfBytes(key, fromSession);
    return fromSession.slice();
  }
  return null;
}

export function getDocumentPdfFileUrl(documentId: string, versionId: string): string {
  return `${apiBaseUrl}/documents/${documentId}/versions/${versionId}/file`;
}

export function documentPdfAuthHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchBlobWithRetry(
  url: string,
  init: RequestInit,
  attempts = 5,
  timeoutMs = 30000,
): Promise<Blob> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const controller = new AbortController();
    const linkedSignal = init.signal;
    const onAbort = () => controller.abort();
    linkedSignal?.addEventListener('abort', onAbort);
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
      if (res.ok) return await res.blob();
      if (res.status === 404) throw new Error('HTTP 404');
      if (res.status === 503) throw new Error('HTTP 503');
      if (res.status >= 500 && attempt < attempts - 1) {
        await sleep(400 * (attempt + 1));
        continue;
      }
      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastError = err;
      if (linkedSignal?.aborted) throw err;
      if (attempt < attempts - 1) await sleep(400 * (attempt + 1));
    } finally {
      clearTimeout(timeout);
      linkedSignal?.removeEventListener('abort', onAbort);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Не удалось загрузить PDF');
}

async function loadDocumentPdfBytesOnce(params: {
  documentId: string;
  versionId: string;
  token: string | null;
  fetchPresignedUrl?: () => Promise<string>;
  signal?: AbortSignal;
  preferProxy?: boolean;
}): Promise<Uint8Array> {
  const cacheKey = `${params.documentId}/${params.versionId}`;
  const fileUrl = getDocumentPdfFileUrl(params.documentId, params.versionId);
  const fileHeaders = documentPdfAuthHeaders(params.token);

  const loadViaProxy = async () => {
    const blob = await fetchBlobWithRetry(
      fileUrl,
      { headers: fileHeaders, signal: params.signal },
      2,
      22_000,
    );
    return new Uint8Array(await blob.arrayBuffer());
  };

  const loadViaPresigned = async () => {
    if (!params.fetchPresignedUrl) throw new Error('No presigned URL');
    const presignedUrl = await params.fetchPresignedUrl();
    const blob = await fetchBlobWithRetry(presignedUrl, { signal: params.signal }, 2, 18_000);
    return new Uint8Array(await blob.arrayBuffer());
  };

  if (params.preferProxy) {
    try {
      return await loadViaProxy();
    } catch {
      return loadViaPresigned();
    }
  }

  try {
    return await loadViaPresigned();
  } catch {
    return loadViaProxy();
  }
}

export async function loadDocumentPdfBytes(params: {
  documentId: string;
  versionId: string;
  token: string | null;
  fetchPresignedUrl?: () => Promise<string>;
  signal?: AbortSignal;
  preferProxy?: boolean;
}): Promise<Uint8Array> {
  const cacheKey = `${params.documentId}/${params.versionId}`;
  const cached = getCachedPdfBytes(params.documentId, params.versionId);
  if (cached) return cached;

  const inflight = inflightPdfLoads.get(cacheKey);
  if (inflight) return inflight.then((bytes) => bytes.slice());

  const promise = loadDocumentPdfBytesOnce(params)
    .then((bytes) => {
      cachePdfBytes(cacheKey, bytes);
      return bytes;
    })
    .finally(() => {
      inflightPdfLoads.delete(cacheKey);
    });

  inflightPdfLoads.set(cacheKey, promise);
  return promise.then((bytes) => bytes.slice());
}

function triggerBlobDownload(blob: Blob, fileName: string): void {
  const blobUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = fileName.toLowerCase().endsWith('.pdf') ? fileName : `${fileName}.pdf`;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(blobUrl);
}

export async function downloadDocumentPdf(
  documentId: string,
  versionId: string,
  fileName: string,
  token: string | null,
  fetchPresignedUrl?: () => Promise<string>,
): Promise<void> {
  const bytes = await loadDocumentPdfBytes({
    documentId,
    versionId,
    token,
    fetchPresignedUrl,
    preferProxy: true,
  });
  triggerBlobDownload(new Blob([bytes.slice()], { type: 'application/pdf' }), fileName);
}
