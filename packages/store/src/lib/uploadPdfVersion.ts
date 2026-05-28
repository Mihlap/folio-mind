import { putFileToPresignedUrl, isLikelyCorsOrNetworkError } from './presignedUpload.js';

export type UploadPdfVersionArgs = {
  documentId: string;
  versionId: string;
  file: File;
  uploadUrl: string;
  completeUpload: (args: {
    documentId: string;
    versionId: string;
  }) => Promise<{ versionId: string; status: string; jobId: string }>;
  fallbackProxyUpload: (args: {
    documentId: string;
    versionId: string;
    file: File;
  }) => Promise<{ versionId: string; status: string; jobId: string }>;
  onProgress?: (percent: number) => void;
};

export async function uploadPdfVersion(
  args: UploadPdfVersionArgs,
): Promise<{ versionId: string; status: string; jobId: string; via: 'presigned' | 'proxy' }> {
  const contentType = args.file.type || 'application/pdf';

  try {
    await putFileToPresignedUrl(args.uploadUrl, args.file, contentType, args.onProgress);
    const result = await args.completeUpload({
      documentId: args.documentId,
      versionId: args.versionId,
    });
    return { ...result, via: 'presigned' };
  } catch (err) {
    if (!isLikelyCorsOrNetworkError(err)) throw err;
    args.onProgress?.(10);
    let smoothProgress = 10;
    const timer = setInterval(() => {
      smoothProgress = Math.min(95, smoothProgress + 5);
      args.onProgress?.(smoothProgress);
    }, 250);
    try {
      const result = await args.fallbackProxyUpload({
        documentId: args.documentId,
        versionId: args.versionId,
        file: args.file,
      });
      args.onProgress?.(100);
      return { ...result, via: 'proxy' };
    } finally {
      clearInterval(timer);
    }
  }
}
