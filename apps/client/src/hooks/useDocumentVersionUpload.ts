import { useCallback, useRef, useState } from 'react';
import { useAppSelector } from '../hooks/index.js';
import { useBackgroundUpload } from '../context/useBackgroundUpload.js';
import { getUploadStage } from '../lib/uploads/uploadStage.js';

export function useDocumentVersionUpload(
  documentId: string,
  onVersionCreated: (versionId: string) => void,
) {
  const inputRef = useRef<HTMLInputElement>(null);
  const docxInputRef = useRef<HTMLInputElement>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const uploadState = useAppSelector((s) => s.backgroundUpload);
  const { uploadDocumentVersion, uploadDocumentVersionFromDocx } = useBackgroundUpload();
  const uploading =
    uploadState.active && uploadState.kind === 'version' && uploadState.documentId === documentId;
  const progress = uploading ? uploadState.progress : 0;
  const showDone = uploading && uploadState.showDone;

  const openFilePicker = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const openDocxFilePicker = useCallback(() => {
    docxInputRef.current?.click();
  }, []);

  const handleDocxFile = useCallback(
    (file: File) => {
      if (!file.name.toLowerCase().endsWith('.docx')) {
        setValidationError('Только DOCX');
        return;
      }
      setValidationError(null);
      uploadDocumentVersionFromDocx(documentId, file, ({ versionId }) => {
        onVersionCreated(versionId);
      });
      if (docxInputRef.current) docxInputRef.current.value = '';
    },
    [documentId, uploadDocumentVersionFromDocx, onVersionCreated],
  );

  const handleFile = useCallback(
    (file: File, docxFile?: File) => {
      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        setValidationError('Только PDF');
        return;
      }
      setValidationError(null);
      uploadDocumentVersion(documentId, file, docxFile, ({ versionId }) => {
        onVersionCreated(versionId);
      });
      if (inputRef.current) inputRef.current.value = '';
    },
    [documentId, uploadDocumentVersion, onVersionCreated],
  );

  const uploadLabel = uploading ? (progress > 0 ? `${progress}%` : '…') : null;
  const uploadHint =
    uploading && progress > 0
      ? showDone && progress === 100
        ? 'Готово'
        : getUploadStage(progress)
      : null;

  return {
    inputRef,
    docxInputRef,
    uploading,
    uploadProgress: uploading ? progress : null,
    uploadLabel,
    uploadHint,
    error: validationError ?? (uploading ? uploadState.error : null),
    setError: setValidationError,
    openFilePicker,
    openDocxFilePicker,
    handleFile,
    handleDocxFile,
  };
}
