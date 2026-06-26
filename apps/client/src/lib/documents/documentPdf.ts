import { apiBaseUrl } from '@folio-mind/store';

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export function getDocumentPdfFileUrl(documentId: string, versionId: string): string {
  return `${apiBaseUrl}/documents/${documentId}/versions/${versionId}/file`;
}

export function documentPdfAuthHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchBlobWithRetry(
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
        await sleep(500 * (attempt + 1));
        continue;
      }
      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastError = err;
      if (linkedSignal?.aborted) throw err;
      if (attempt < attempts - 1) await sleep(500 * (attempt + 1));
    } finally {
      clearTimeout(timeout);
      linkedSignal?.removeEventListener('abort', onAbort);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Не удалось загрузить PDF');
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
): Promise<void> {
  const headers = documentPdfAuthHeaders(token);
  const fileUrl = getDocumentPdfFileUrl(documentId, versionId);
  const blob = await fetchBlobWithRetry(fileUrl, { headers }, 6, 120000);
  triggerBlobDownload(blob, fileName);
}
