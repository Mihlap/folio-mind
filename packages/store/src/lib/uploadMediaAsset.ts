import { UPLOAD_NETWORK_ERROR_MESSAGE } from './formatUploadError.js';
import { isLikelyCorsOrNetworkError, putFileToPresignedUrl } from './presignedUpload.js';
import { apiBaseUrl } from '../api/baseApi.js';
import type { MediaAssetItem } from '../api/mediaApi.js';

function isProxyStorageError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  if ('status' in err && (err as { status: unknown }).status === 503) return true;
  if ('data' in err && typeof (err as { data: unknown }).data === 'string') {
    return /S3|хранилищ|ECONNRESET|недоступн/i.test((err as { data: string }).data);
  }
  return isLikelyCorsOrNetworkError(err);
}

async function apiFetch(
  path: string,
  token: string | null,
  init: RequestInit,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const res = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const data: unknown = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function proxyUploadMediaAsset(
  assetId: string,
  file: File,
  token: string | null,
): Promise<MediaAssetItem> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${apiBaseUrl}/media-assets/${encodeURIComponent(assetId)}/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  const data: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err =
      typeof data === 'object' && data && 'error' in data
        ? String((data as { error: string }).error)
        : res.status === 503 || res.status >= 500
          ? UPLOAD_NETWORK_ERROR_MESSAGE
          : `Ошибка загрузки (${res.status})`;
    throw Object.assign(new Error(err), { status: res.status, data: err });
  }
  return data as MediaAssetItem;
}

export async function uploadMediaAssetFile(
  file: File,
  options: {
    token: string | null;
    documentId?: string;
    title?: string;
    width?: number;
    height?: number;
  },
): Promise<MediaAssetItem> {
  const contentType = file.type || 'image/png';
  const createdRes = await apiFetch('/media-assets', options.token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: file.name,
      mimeType: contentType,
      size: file.size,
      title: options.title,
      documentId: options.documentId,
      ...(options.width && options.width > 0 ? { width: options.width } : {}),
      ...(options.height && options.height > 0 ? { height: options.height } : {}),
    }),
  });
  if (!createdRes.ok) {
    const err =
      typeof createdRes.data === 'object' && createdRes.data && 'error' in createdRes.data
        ? String((createdRes.data as { error: string }).error)
        : `Ошибка создания (${createdRes.status})`;
    throw Object.assign(new Error(err), { status: createdRes.status, data: err });
  }
  const created = createdRes.data as { id: string; uploadUrl: string; s3Key: string };

  try {
    return await proxyUploadMediaAsset(created.id, file, options.token);
  } catch (proxyErr) {
    if (!isProxyStorageError(proxyErr)) throw proxyErr;
    try {
      await putFileToPresignedUrl(created.uploadUrl, file, contentType);
      const completeRes = await apiFetch(
        `/media-assets/${encodeURIComponent(created.id)}/complete`,
        options.token,
        { method: 'POST' },
      );
      if (!completeRes.ok) {
        const err =
          typeof completeRes.data === 'object' && completeRes.data && 'error' in completeRes.data
            ? String((completeRes.data as { error: string }).error)
            : `Ошибка завершения (${completeRes.status})`;
        throw Object.assign(new Error(err), { status: completeRes.status, data: err });
      }
      return completeRes.data as MediaAssetItem;
    } catch {
      throw proxyErr instanceof Error ? proxyErr : new Error(UPLOAD_NETWORK_ERROR_MESSAGE);
    }
  }
}
