import { putFileToPresignedUrl, isLikelyCorsOrNetworkError } from './presignedUpload.js';
export type UploadPdfVersionArgs = {
  documentId: string;
  versionId: string;
  file: File;
  uploadUrl: string;
  forceOcr?: boolean;
  completeUpload: (args: {
    documentId: string;
    versionId: string;
    forceOcr?: boolean;
  }) => Promise<{
    versionId: string;
    status: string;
    jobId: string;
  }>;
  fallbackProxyUpload: (args: {
    documentId: string;
    versionId: string;
    file: File;
    forceOcr?: boolean;
  }) => Promise<{
    versionId: string;
    status: string;
    jobId: string;
  }>;
  onProgress?: (percent: number) => void;
};
function isProxyStorageError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  if (
    'status' in err &&
    (
      err as {
        status: unknown;
      }
    ).status === 503
  )
    return true;
  if (
    'data' in err &&
    typeof (
      err as {
        data: unknown;
      }
    ).data === 'string'
  ) {
    return /S3|хранилищ|ECONNRESET|недоступн/i.test(
      (
        err as {
          data: string;
        }
      ).data,
    );
  }
  return isLikelyCorsOrNetworkError(err);
}
export async function uploadPdfVersion(args: UploadPdfVersionArgs): Promise<{
  versionId: string;
  status: string;
  jobId: string;
  via: 'presigned' | 'proxy';
}> {
  const contentType = args.file.type || 'application/pdf';
  let smoothProgress = 5;
  args.onProgress?.(smoothProgress);
  const timer = setInterval(() => {
    smoothProgress = Math.min(92, smoothProgress + 3);
    args.onProgress?.(smoothProgress);
  }, 350);
  try {
    const result = await args.fallbackProxyUpload({
      documentId: args.documentId,
      versionId: args.versionId,
      file: args.file,
      forceOcr: args.forceOcr,
    });
    args.onProgress?.(100);
    return { ...result, via: 'proxy' };
  } catch (proxyErr) {
    if (!isProxyStorageError(proxyErr)) throw proxyErr;
    try {
      await putFileToPresignedUrl(args.uploadUrl, args.file, contentType, args.onProgress);
      const result = await args.completeUpload({
        documentId: args.documentId,
        versionId: args.versionId,
        forceOcr: args.forceOcr,
      });
      return { ...result, via: 'presigned' };
    } catch {
      throw proxyErr;
    }
  } finally {
    clearInterval(timer);
  }
}
