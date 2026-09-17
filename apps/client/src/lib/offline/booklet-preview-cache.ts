import { apiBaseUrl } from '@folio-mind/store';

const DB_NAME = 'razum-offline';
const STORE = 'booklet-previews';
const DB_VERSION = 1;

export const OFFLINE_BOOKLET_MAX_PAGES = 30;

export type OfflinePreviewPage = {
  page: number; 
  dataUrl: string;
};

export type OfflineBookletCacheEntry = {
  documentId: string;
  versionId: string;
  title: string;
  pageCount: number;
  pages: OfflinePreviewPage[];
  savedAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

function cacheKey(documentId: string, versionId: string): string {
  return `${documentId}:${versionId}`;
}

function previewProxyUrl(documentId: string, versionId: string, page: number): string {
  const base = apiBaseUrl.replace(/\/+$/, '');
  const url = `${base}/documents/${documentId}/versions/${versionId}/preview-page/${page}`;
  return url;
}

async function blobUrlToDataUrl(url: string, headers?: Record<string, string>): Promise<string | null> {
  try {
    const res = await fetch(url, headers ? { headers } : undefined);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function saveBookletPreviewCache(input: {
  documentId: string;
  versionId: string;
  title: string;
  pageCount: number;
  pages: Array<{ page: number; url: string }>;
  token?: string | null;
}): Promise<number> {
  if (typeof indexedDB === 'undefined') return 0;
  const slice = input.pages
    .filter((p) => p.url)
    .slice(0, OFFLINE_BOOKLET_MAX_PAGES)
    .sort((a, b) => a.page - b.page);

  const authHeaders = input.token ? { Authorization: `Bearer ${input.token}` } : undefined;
  const offlinePages: OfflinePreviewPage[] = [];
  for (const page of slice) {
    const proxyUrl = previewProxyUrl(input.documentId, input.versionId, page.page);
    const dataUrl = await blobUrlToDataUrl(proxyUrl, authHeaders);
    if (dataUrl) offlinePages.push({ page: page.page, dataUrl });
  }
  if (offlinePages.length === 0) return 0;

  const entry: OfflineBookletCacheEntry & { id: string } = {
    id: cacheKey(input.documentId, input.versionId),
    documentId: input.documentId,
    versionId: input.versionId,
    title: input.title,
    pageCount: input.pageCount,
    pages: offlinePages,
    savedAt: Date.now(),
  };

  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('indexedDB put failed'));
    });
  } finally {
    db.close();
  }
  return offlinePages.length;
}

export async function loadBookletPreviewCache(
  documentId: string,
  versionId: string,
): Promise<OfflineBookletCacheEntry | null> {
  if (typeof indexedDB === 'undefined') return null;
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(cacheKey(documentId, versionId));
      req.onsuccess = () => resolve((req.result as OfflineBookletCacheEntry | undefined) ?? null);
      req.onerror = () => reject(req.error ?? new Error('indexedDB get failed'));
    });
  } finally {
    db.close();
  }
}

export function selectPagesForOfflineCache<T extends { page: number; url: string }>(
  pages: T[],
  max = OFFLINE_BOOKLET_MAX_PAGES,
): T[] {
  return [...pages]
    .filter((p) => Boolean(p.url))
    .sort((a, b) => a.page - b.page)
    .slice(0, max);
}
