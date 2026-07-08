import { useCallback, useRef, useState } from 'react';
import { useAppSelector } from '../hooks/index.js';
import { useBackgroundUpload } from '../context/useBackgroundUpload.js';
import { getUploadStage } from '../lib/uploads/uploadStage.js';

export function useCreateDocumentUpload(onDocumentCreated: (documentId: string) => void) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const uploadState = useAppSelector((s) => s.backgroundUpload);
  const { uploadNewDocument } = useBackgroundUpload();
  const uploading = uploadState.active && uploadState.kind === 'new-document';
  const progress = uploading ? uploadState.progress : 0;
  const showDone = uploading && uploadState.showDone;

  const openFilePicker = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleFile = useCallback(
    (file: File) => {
      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        setValidationError('Только PDF');
        return;
      }
      setValidationError(null);
      uploadNewDocument(file, onDocumentCreated);
      if (inputRef.current) inputRef.current.value = '';
    },
    [uploadNewDocument, onDocumentCreated],
  );

  const uploadHint =
    uploading && progress > 0
      ? showDone && progress === 100
        ? 'Готово'
        : getUploadStage(progress)
      : null;

  return {
    inputRef,
    uploading,
    uploadProgress: uploading ? progress : null,
    error: validationError ?? (uploading ? uploadState.error : null),
    setError: setValidationError,
    openFilePicker,
    handleFile,
    uploadHint,
  };
}
