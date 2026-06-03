import { useCallback, useRef, useState } from 'react';
import {
  uploadPdfVersion,
  useCompleteUploadMutation,
  useCreateDocumentVersionMutation,
  useUploadVersionFileMutation,
} from '@folio-mind/store';

async function waitMs(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function getUploadStage(progress: number | null): string {
  if (progress === null || progress <= 0) return 'Подготовка…';
  if (progress < 100) return 'Загрузка файла…';
  return 'Подтверждение…';
}

export function useDocumentVersionUpload(documentId: string, onVersionCreated: (versionId: string) => void) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [showUploadDone, setShowUploadDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createVersion] = useCreateDocumentVersionMutation();
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
    setShowUploadDone(false);
    setUploadProgress(0);

    try {
      const created = await createVersion({
        documentId,
        fileName: file.name,
        mimeType: file.type || 'application/pdf',
        size: file.size,
      }).unwrap();

      await uploadPdfVersion({
        documentId,
        versionId: created.versionId,
        file,
        uploadUrl: created.uploadUrl,
        completeUpload: (args) => completeUpload(args).unwrap(),
        fallbackProxyUpload: (args) => uploadVersionFile(args).unwrap(),
        onProgress: handleProgress,
      });

      onVersionCreated(created.versionId);
      setShowUploadDone(true);
      await waitMs(350);
    } catch (e) {
      const msg =
        e && typeof e === 'object' && 'data' in e && typeof (e as { data: unknown }).data === 'string'
          ? (e as { data: string }).data
          : e instanceof Error
            ? e.message
            : 'Не удалось загрузить версию';
      setError(msg);
    } finally {
      if (latestProgress === 100) {
        await waitMs(150);
      }
      setUploading(false);
      setShowUploadDone(false);
      setUploadProgress(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  const uploadLabel = uploading
    ? uploadProgress !== null
      ? `${uploadProgress}%`
      : '…'
    : null;

  const uploadHint =
    uploading && uploadProgress !== null
      ? showUploadDone && uploadProgress === 100
        ? 'Готово'
        : getUploadStage(uploadProgress)
      : null;

  return {
    inputRef,
    uploading,
    uploadProgress,
    uploadLabel,
    uploadHint,
    error,
    setError,
    openFilePicker,
    handleFile,
  };
}
