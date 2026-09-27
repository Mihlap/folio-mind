import { UPLOAD_NETWORK_ERROR_MESSAGE } from './formatUploadError.js';
function describeS3Failure(status: number, responseText: string): string {
  const code = /<Code>([^<]+)<\/Code>/i.exec(responseText)?.[1];
  const message = /<Message>([^<]+)<\/Message>/i.exec(responseText)?.[1];
  const details = [code, message].filter(Boolean).join(': ');
  return details
    ? `Хранилище вернуло ошибку ${status} (${details})`
    : `Хранилище вернуло ошибку ${status}`;
}

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
      reject(new Error(describeS3Failure(xhr.status, xhr.responseText || '')));
    };
    xhr.onerror = () => {
      reject(
        new Error(
          `Загрузка в хранилище не дошла до сервера (${new URL(uploadUrl).host}). Проверьте CORS для этого адреса.`,
        ),
      );
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
  return /CORS|network ?error|NetworkError|timeout|timed out|ECONNRESET|ECONNREFUSED|ETIMEDOUT|Failed to fetch|не дошла до сервера/i.test(
    err.message,
  );
}
