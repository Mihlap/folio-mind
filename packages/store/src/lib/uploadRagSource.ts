import { isLikelyCorsOrNetworkError, putFileToPresignedUrl } from './presignedUpload.js';

export type UploadRagSourceArgs = {
  sourceId: string;
  file: File;
  uploadUrl: string;
  mimeType: string;
  completeRagSource: (args: { sourceId: string }) => Promise<{
    sourceId: string;
    status: string;
    jobId: string;
  }>;
  fallbackProxyUpload: (args: { sourceId: string; file: File }) => Promise<{
    sourceId: string;
    status: string;
    jobId: string;
  }>;
  onProgress?: (percent: number) => void;
};

function isProxyStorageError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  if ('status' in err && (err as { status: unknown }).status === 503) return true;
  if ('data' in err && typeof (err as { data: unknown }).data === 'string') {
    return /S3|хранилищ|ECONNRESET|недоступн/i.test((err as { data: string }).data);
  }
  return isLikelyCorsOrNetworkError(err);
}

export async function uploadRagSource(args: UploadRagSourceArgs): Promise<{
  sourceId: string;
  status: string;
  jobId: string;
  via: 'presigned' | 'proxy';
}> {
  const contentType = args.mimeType || 'application/octet-stream';
  let smoothProgress = 5;
  args.onProgress?.(smoothProgress);
  const timer = setInterval(() => {
    smoothProgress = Math.min(92, smoothProgress + 3);
    args.onProgress?.(smoothProgress);
  }, 350);

  try {
    try {
      const result = await args.fallbackProxyUpload({
        sourceId: args.sourceId,
        file: args.file,
      });
      args.onProgress?.(100);
      return { ...result, via: 'proxy' };
    } catch (proxyErr) {
      if (!isProxyStorageError(proxyErr)) throw proxyErr;
      await putFileToPresignedUrl(args.uploadUrl, args.file, contentType, args.onProgress);
      const result = await args.completeRagSource({ sourceId: args.sourceId });
      args.onProgress?.(100);
      return { ...result, via: 'presigned' };
    }
  } finally {
    clearInterval(timer);
  }
}
