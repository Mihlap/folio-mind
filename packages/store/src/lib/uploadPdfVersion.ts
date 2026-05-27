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
    const result = await args.fallbackProxyUpload({
      documentId: args.documentId,
      versionId: args.versionId,
      file: args.file,
    });
    return { ...result, via: 'proxy' };
  }
}
