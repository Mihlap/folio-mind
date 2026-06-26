import { UPLOAD_NETWORK_ERROR_MESSAGE } from './formatUploadError.js';
import { apiBaseUrl } from '../api/baseApi.js';
import { putFileToPresignedUrl, isLikelyCorsOrNetworkError } from './presignedUpload.js';
export async function uploadSourceDocx(params: {
  documentId: string;
  versionId: string;
  file: File;
  uploadUrl: string;
  docxS3Key: string;
  token: string | null;
  completeDocxUpload: (args: {
    documentId: string;
    versionId: string;
    docxS3Key: string;
  }) => Promise<{
    sourceDocxKey: string;
  }>;
}): Promise<void> {
  const contentType =
    params.file.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  try {
    const formData = new FormData();
    formData.append('file', params.file);
    const res = await fetch(
      `${apiBaseUrl}/documents/${params.documentId}/versions/${params.versionId}/source-docx-upload`,
      {
        method: 'POST',
        headers: params.token ? { Authorization: `Bearer ${params.token}` } : {},
        body: formData,
      },
    );
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      throw new Error(
        res.status === 503 || res.status >= 500
          ? UPLOAD_NETWORK_ERROR_MESSAGE
          : (data.error ?? `Ошибка загрузки DOCX (${res.status})`),
      );
    }
    return;
  } catch (proxyErr) {
    if (
      !isLikelyCorsOrNetworkError(proxyErr) &&
      !(proxyErr instanceof Error && /DOCX/i.test(proxyErr.message))
    ) {
      throw proxyErr instanceof Error ? proxyErr : new Error(UPLOAD_NETWORK_ERROR_MESSAGE);
    }
    await putFileToPresignedUrl(params.uploadUrl, params.file, contentType);
    await params.completeDocxUpload({
      documentId: params.documentId,
      versionId: params.versionId,
      docxS3Key: params.docxS3Key,
    });
  }
}
