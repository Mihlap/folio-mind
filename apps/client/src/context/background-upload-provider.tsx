import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import {
  uploadPdfVersion,
  uploadSourceDocx,
  formatUploadError,
  uploadStarted,
  uploadProgress,
  uploadShowDone,
  uploadFinished,
  uploadFailed,
  clearUploadError,
  useCompleteDocxUploadMutation,
  useCompleteUploadMutation,
  useCreateDocumentMutation,
  useCreateDocumentVersionMutation,
  useUploadVersionFileMutation,
} from '@folio-mind/store';
import { useAppDispatch, useAppSelector } from '../hooks/index.js';
import { uploadFileLabel } from '../lib/uploads/uploadStage.js';

async function waitMs(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

type VersionUploadSuccess = {
  documentId: string;
  versionId: string;
};

type BackgroundUploadContextValue = {
  active: boolean;
  progress: number;
  fileLabel: string;
  showDone: boolean;
  error: string | null;
  clearError: () => void;
  uploadFromDashboard: (pdfFile: File, docxFile?: File) => void;
  uploadNewDocument: (pdfFile: File, onCreated?: (documentId: string) => void) => void;
  uploadDocumentVersion: (
    documentId: string,
    pdfFile: File,
    docxFile?: File,
    onSuccess?: (result: VersionUploadSuccess) => void,
  ) => void;
};

const BackgroundUploadContext = createContext<BackgroundUploadContextValue | null>(null);

export function BackgroundUploadProvider({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const token = useAppSelector((s) => s.auth.token);
  const uploadState = useAppSelector((s) => s.backgroundUpload);
  const inFlightRef = useRef(false);

  const [createDocument] = useCreateDocumentMutation();
  const [createVersion] = useCreateDocumentVersionMutation();
  const [completeUpload] = useCompleteUploadMutation();
  const [completeDocxUpload] = useCompleteDocxUploadMutation();
  const [uploadVersionFile] = useUploadVersionFileMutation();

  const runUpload = useCallback(
    async (params: {
      kind: 'dashboard' | 'new-document' | 'version';
      fileLabel: string;
      documentId?: string;
      execute: (onProgress: (percent: number) => void) => Promise<void>;
      onSuccess?: () => void;
    }) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      let latestProgress = 0;

      dispatch(
        uploadStarted({
          kind: params.kind,
          fileLabel: params.fileLabel,
          documentId: params.documentId,
        }),
      );

      try {
        await params.execute((percent) => {
          latestProgress = percent;
          dispatch(uploadProgress(percent));
        });
        dispatch(uploadShowDone());
        params.onSuccess?.();
        await waitMs(350);
        if (latestProgress === 100) {
          await waitMs(150);
        }
        dispatch(uploadFinished());
      } catch (e) {
        dispatch(uploadFailed(formatUploadError(e)));
      } finally {
        inFlightRef.current = false;
      }
    },
    [dispatch],
  );

  const uploadPdfWithDocx = useCallback(
    async (
      documentId: string,
      versionId: string,
      pdfFile: File,
      created: {
        uploadUrl: string;
        docxUploadUrl?: string;
        docxS3Key?: string;
      },
      docxFile: File | undefined,
      onProgress: (percent: number) => void,
    ) => {
      await uploadPdfVersion({
        documentId,
        versionId,
        file: pdfFile,
        uploadUrl: created.uploadUrl,
        completeUpload: (args) => completeUpload(args).unwrap(),
        fallbackProxyUpload: (args) => uploadVersionFile(args).unwrap(),
        onProgress,
      });
      if (docxFile && created.docxUploadUrl && created.docxS3Key) {
        await uploadSourceDocx({
          documentId,
          versionId,
          file: docxFile,
          uploadUrl: created.docxUploadUrl,
          docxS3Key: created.docxS3Key,
          token,
          completeDocxUpload: (args) => completeDocxUpload(args).unwrap(),
        });
      }
    },
    [completeUpload, completeDocxUpload, uploadVersionFile, token],
  );

  const uploadFromDashboard = useCallback(
    (pdfFile: File, docxFile?: File) => {
      void runUpload({
        kind: 'dashboard',
        fileLabel: uploadFileLabel(pdfFile.name, docxFile?.name),
        execute: async (onProgress) => {
          const title = pdfFile.name.replace(/\.pdf$/i, '');
          const docxFileName = docxFile?.name;
          const created = await createDocument({
            title,
            fileName: pdfFile.name,
            mimeType: pdfFile.type || 'application/pdf',
            size: pdfFile.size,
            ...(docxFileName ? { docxFileName } : {}),
          }).unwrap();
          await uploadPdfWithDocx(
            created.document.id,
            created.versionId,
            pdfFile,
            created,
            docxFile,
            onProgress,
          );
        },
      });
    },
    [runUpload, createDocument, uploadPdfWithDocx],
  );

  const uploadNewDocument = useCallback(
    (pdfFile: File, onCreated?: (documentId: string) => void) => {
      void runUpload({
        kind: 'new-document',
        fileLabel: pdfFile.name,
        execute: async (onProgress) => {
          const title = pdfFile.name.replace(/\.pdf$/i, '');
          const created = await createDocument({
            title,
            fileName: pdfFile.name,
            mimeType: pdfFile.type || 'application/pdf',
            size: pdfFile.size,
          }).unwrap();
          await uploadPdfWithDocx(
            created.document.id,
            created.versionId,
            pdfFile,
            created,
            undefined,
            onProgress,
          );
          onCreated?.(created.document.id);
        },
      });
    },
    [runUpload, createDocument, uploadPdfWithDocx],
  );

  const uploadDocumentVersion = useCallback(
    (
      documentId: string,
      pdfFile: File,
      docxFile?: File,
      onSuccess?: (result: VersionUploadSuccess) => void,
    ) => {
      void runUpload({
        kind: 'version',
        fileLabel: uploadFileLabel(pdfFile.name, docxFile?.name),
        documentId,
        execute: async (onProgress) => {
          const docxFileName = docxFile?.name;
          const created = await createVersion({
            documentId,
            fileName: pdfFile.name,
            mimeType: pdfFile.type || 'application/pdf',
            size: pdfFile.size,
            ...(docxFileName ? { docxFileName } : {}),
          }).unwrap();
          await uploadPdfWithDocx(
            documentId,
            created.versionId,
            pdfFile,
            created,
            docxFile,
            onProgress,
          );
          onSuccess?.({ documentId, versionId: created.versionId });
        },
      });
    },
    [runUpload, createVersion, uploadPdfWithDocx],
  );

  const value = useMemo(
    () => ({
      active: uploadState.active,
      progress: uploadState.progress,
      fileLabel: uploadState.fileLabel,
      showDone: uploadState.showDone,
      error: uploadState.error,
      clearError: () => dispatch(clearUploadError()),
      uploadFromDashboard,
      uploadNewDocument,
      uploadDocumentVersion,
    }),
    [
      uploadState.active,
      uploadState.progress,
      uploadState.fileLabel,
      uploadState.showDone,
      uploadState.error,
      dispatch,
      uploadFromDashboard,
      uploadNewDocument,
      uploadDocumentVersion,
    ],
  );

  return (
    <BackgroundUploadContext.Provider value={value}>{children}</BackgroundUploadContext.Provider>
  );
}

export function useBackgroundUpload() {
  const ctx = useContext(BackgroundUploadContext);
  if (!ctx) {
    throw new Error('useBackgroundUpload must be used within BackgroundUploadProvider');
  }
  return ctx;
}
