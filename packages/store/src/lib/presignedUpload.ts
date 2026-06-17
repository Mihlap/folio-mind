export async function putFileToPresignedUrl(
  uploadUrl: string,
  file: File,
  contentType: string,
  onProgress?: (percent: number) => void,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const TIMEOUT_MS = 5 * 60 * 1000; // 5 min
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
      reject(new Error(`S3 upload failed (${xhr.status})`));
    };

    xhr.onerror = () => {
      reject(new Error('S3 upload network error — проверьте CORS на бакете'));
    };

    xhr.ontimeout = () => {
      reject(new Error('S3 upload timeout — файл слишком большой или медленное соединение'));
    };

    xhr.send(file);
  });
}

export function isLikelyCorsOrNetworkError(err: unknown): boolean {
  return err instanceof Error && /CORS|network error|S3 upload network/i.test(err.message);
}
