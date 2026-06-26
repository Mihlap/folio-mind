import { UPLOAD_NETWORK_ERROR_MESSAGE } from './formatUploadError.js';
export async function putFileToPresignedUrl(
  uploadUrl: string,
  file: File,
  contentType: string,
  onProgress?: (percent: number) => void,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const TIMEOUT_MS = 30000;
    xhr.open('PUT', uploadUrl);
    xhr.timeout = TIMEOUT_MS;
    xhr.setRequestHeader('Content-Type', contentType);
    onProgress?.(1);
    xhr.upload.onprogress = (event) => {
      if (!onProgress) return;
      const total = event.lengthComputable && event.total > 0 ? event.total : file.size;
      if (!total || total <= 0) return;
      const percent = Math.max(1, Math.min(99, Math.round((event.loaded / total) * 100)));
      onProgress(percent);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve();
        return;
      }
      reject(new Error(UPLOAD_NETWORK_ERROR_MESSAGE));
    };
    xhr.onerror = () => {
      reject(new Error(UPLOAD_NETWORK_ERROR_MESSAGE));
    };
    xhr.ontimeout = () => {
      reject(new Error(UPLOAD_NETWORK_ERROR_MESSAGE));
    };
    xhr.send(file);
  });
}
export function isLikelyCorsOrNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.message === UPLOAD_NETWORK_ERROR_MESSAGE) return true;
  return /CORS|network error|S3 upload|timeout|ECONNRESET|ETIMEDOUT|Failed to fetch|хранилищ|Internal Server/i.test(
    err.message,
  );
}
