import { useCallback, useMemo, useRef, type ReactNode } from 'react';
import {
  uploadPdfVersion,
  uploadRagSource,
  uploadSourceDocx,
  formatUploadError,
  uploadStarted,
  uploadProgress,
  uploadShowDone,
  uploadFinished,
  uploadFailed,
  clearUploadError,
  type BackgroundUploadKind,
  useCompleteDocxUploadMutation,
  useCompleteUploadMutation,
  useCreateDocumentMutation,
  useCreateDocumentFromDocxMutation,
  useImportFromDocxMutation,
  useCreateDocumentVersionMutation,
  useCreateDocumentVersionFromDocxMutation,
  useUploadVersionFileMutation,
  useCompleteRagSourceMutation,
  useCreateRagSourceMutation,
  useUploadRagSourceFileMutation,
} from '@folio-mind/store';
import { useAppDispatch, useAppSelector } from '../hooks/index.js';
import { uploadFileLabel } from '../lib/uploads/uploadStage.js';
import {
  BackgroundUploadContext,
  type UploadOptions,
  type VersionUploadSuccess,
} from './background-upload-context-value.js';

async function waitMs(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export function BackgroundUploadProvider({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const token = useAppSelector((s) => s.auth.token);
  const uploadState = useAppSelector((s) => s.backgroundUpload);
  const inFlightRef = useRef(false);

  const [createDocument] = useCreateDocumentMutation();
  const [createDocumentFromDocx] = useCreateDocumentFromDocxMutation();
  const [importFromDocx] = useImportFromDocxMutation();
  const [createVersionFromDocx] = useCreateDocumentVersionFromDocxMutation();
  const [createVersion] = useCreateDocumentVersionMutation();
  const [completeUpload] = useCompleteUploadMutation();
  const [completeDocxUpload] = useCompleteDocxUploadMutation();
  const [uploadVersionFile] = useUploadVersionFileMutation();
  const [createRagSource] = useCreateRagSourceMutation();
  const [completeRagSource] = useCompleteRagSourceMutation();
  const [uploadRagSourceFile] = useUploadRagSourceFileMutation();

  const runUpload = useCallback(
    async (params: {
      kind: BackgroundUploadKind;
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
      options?: UploadOptions,
    ) => {
      await uploadPdfVersion({
        documentId,
        versionId,
        file: pdfFile,
        uploadUrl: created.uploadUrl,
        completeUpload: (args) => completeUpload(args).unwrap(),
        fallbackProxyUpload: (args) => uploadVersionFile(args).unwrap(),
        onProgress,
        ...(options?.forceOcr ? { forceOcr: true } : {}),
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
    (pdfFile: File, docxFile?: File, projectId?: string, options?: UploadOptions) => {
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
            ...(projectId ? { projectId } : {}),
          }).unwrap();
          await uploadPdfWithDocx(
            created.document.id,
            created.versionId,
            pdfFile,
            created,
            docxFile,
            onProgress,
            options,
          );
        },
      });
    },
    [runUpload, createDocument, uploadPdfWithDocx],
  );

  const uploadFromDocxOnly = useCallback(
    (docxFile: File, projectId?: string) => {
      void runUpload({
        kind: 'dashboard',
        fileLabel: docxFile.name,
        execute: async (onProgress) => {
          const title = docxFile.name.replace(/\.docx$/i, '');
          const created = await createDocumentFromDocx({
            title,
            fileName: docxFile.name,
            size: docxFile.size,
            ...(projectId ? { projectId } : {}),
          }).unwrap();
          onProgress(15);
          await uploadSourceDocx({
            documentId: created.document.id,
            versionId: created.versionId,
            file: docxFile,
            uploadUrl: created.docxUploadUrl,
            docxS3Key: created.docxS3Key,
            token,
            completeDocxUpload: (args) => completeDocxUpload(args).unwrap(),
          });
          onProgress(55);
          await importFromDocx({
            documentId: created.document.id,
            versionId: created.versionId,
          }).unwrap();
          onProgress(100);
        },
      });
    },
    [runUpload, createDocumentFromDocx, importFromDocx, completeDocxUpload, token],
  );

  const uploadNewDocument = useCallback(
    (
      pdfFile: File,
      onCreated?: (documentId: string) => void,
      options?: UploadOptions,
    ) => {
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
            options,
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
      options?: UploadOptions,
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
            options,
          );
          onSuccess?.({ documentId, versionId: created.versionId });
        },
      });
    },
    [runUpload, createVersion, uploadPdfWithDocx],
  );

  const uploadDocumentVersionFromDocx = useCallback(
    (documentId: string, docxFile: File, onSuccess?: (result: VersionUploadSuccess) => void) => {
      void runUpload({
        kind: 'version',
        fileLabel: docxFile.name,
        documentId,
        execute: async (onProgress) => {
          const created = await createVersionFromDocx({
            documentId,
            fileName: docxFile.name,
            size: docxFile.size,
          }).unwrap();
          onProgress(20);
          await uploadSourceDocx({
            documentId,
            versionId: created.versionId,
            file: docxFile,
            uploadUrl: created.docxUploadUrl,
            docxS3Key: created.docxS3Key,
            token,
            completeDocxUpload: (args) => completeDocxUpload(args).unwrap(),
          });
          onProgress(60);
          await importFromDocx({
            documentId,
            versionId: created.versionId,
          }).unwrap();
          onProgress(100);
          onSuccess?.({ documentId, versionId: created.versionId });
        },
      });
    },
    [runUpload, createVersionFromDocx, importFromDocx, completeDocxUpload, token],
  );

  const uploadRegulation = useCallback(
    (file: File, onSuccess?: () => void) => {
      void runUpload({
        kind: 'regulation',
        fileLabel: file.name,
        execute: async (onProgress) => {
          onProgress(5);
          const lower = file.name.toLowerCase();
          const title = file.name.replace(/\.(pdf|txt)$/i, '');
          const mimeType = file.type || (lower.endsWith('.pdf') ? 'application/pdf' : 'text/plain');
          const created = await createRagSource({
            title,
            fileName: file.name,
            mimeType,
            size: file.size,
          }).unwrap();
          if (!created.uploadUrl) {
            throw new Error('Не удалось получить ссылку для загрузки регламента');
          }
          await uploadRagSource({
            sourceId: created.sourceId,
            file,
            uploadUrl: created.uploadUrl,
            mimeType,
            completeRagSource: (args) => completeRagSource(args).unwrap(),
            fallbackProxyUpload: (args) => uploadRagSourceFile(args).unwrap(),
            onProgress,
          });
          onSuccess?.();
        },
      });
    },
    [runUpload, createRagSource, completeRagSource, uploadRagSourceFile],
  );

  const value = useMemo(
    () => ({
      active: uploadState.active,
      progress: uploadState.progress,
      fileLabel: uploadState.fileLabel,
      showDone: uploadState.showDone,
      error: uploadState.error,
      kind: uploadState.kind,
      clearError: () => dispatch(clearUploadError()),
      uploadFromDashboard,
      uploadFromDocxOnly,
      uploadNewDocument,
      uploadDocumentVersion,
      uploadDocumentVersionFromDocx,
      uploadRegulation,
    }),
    [
      uploadState.active,
      uploadState.progress,
      uploadState.fileLabel,
      uploadState.showDone,
      uploadState.error,
      uploadState.kind,
      dispatch,
      uploadFromDashboard,
      uploadFromDocxOnly,
      uploadNewDocument,
      uploadDocumentVersion,
      uploadDocumentVersionFromDocx,
      uploadRegulation,
    ],
  );

  return (
    <BackgroundUploadContext.Provider value={value}>{children}</BackgroundUploadContext.Provider>
  );
}
