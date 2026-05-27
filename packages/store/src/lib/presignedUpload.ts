export async function putFileToPresignedUrl(
  uploadUrl: string,
  file: File,
  contentType: string,
  onProgress?: (percent: number) => void,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', contentType);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      reject(new Error(`S3 upload failed (${xhr.status})`));
    };

    xhr.onerror = () => {
      reject(new Error('S3 upload network error — проверьте CORS на бакете'));
    };

    xhr.send(file);
  });
}

export function isLikelyCorsOrNetworkError(err: unknown): boolean {
  return err instanceof Error && /CORS|network error|S3 upload network/i.test(err.message);
}
