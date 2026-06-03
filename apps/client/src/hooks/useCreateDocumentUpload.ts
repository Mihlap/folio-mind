import { useCallback, useRef, useState } from 'react';
import {
  uploadPdfVersion,
  useCompleteUploadMutation,
  useCreateDocumentMutation,
  useUploadVersionFileMutation,
} from '@folio-mind/store';

async function waitMs(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export function useCreateDocumentUpload(onDocumentCreated: (documentId: string) => void) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createDocument] = useCreateDocumentMutation();
  const [completeUpload] = useCompleteUploadMutation();
  const [uploadVersionFile] = useUploadVersionFileMutation();

  const openFilePicker = useCallback(() => {
    inputRef.current?.click();
  }, []);

  async function handleFile(file: File) {
    let latestProgress = 0;
    const handleProgress = (percent: number) => {
      latestProgress = percent;
      setUploadProgress(percent);
    };

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Только PDF');
      return;
    }

    setError(null);
    setUploading(true);
    setUploadProgress(0);

    try {
      const title = file.name.replace(/\.pdf$/i, '');
      const created = await createDocument({
        title,
        fileName: file.name,
        mimeType: file.type || 'application/pdf',
        size: file.size,
      }).unwrap();

      await uploadPdfVersion({
        documentId: created.document.id,
        versionId: created.versionId,
        file,
        uploadUrl: created.uploadUrl,
        completeUpload: (args) => completeUpload(args).unwrap(),
        fallbackProxyUpload: (args) => uploadVersionFile(args).unwrap(),
        onProgress: handleProgress,
      });

      onDocumentCreated(created.document.id);
      await waitMs(350);
    } catch (e) {
      const msg =
        e && typeof e === 'object' && 'data' in e && typeof (e as { data: unknown }).data === 'string'
          ? (e as { data: string }).data
          : e instanceof Error
            ? e.message
            : 'Не удалось создать документ';
      setError(msg);
    } finally {
      if (latestProgress === 100) {
        await waitMs(150);
      }
      setUploading(false);
      setUploadProgress(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return {
    inputRef,
    uploading,
    uploadProgress,
    error,
    setError,
    openFilePicker,
    handleFile,
  };
}
