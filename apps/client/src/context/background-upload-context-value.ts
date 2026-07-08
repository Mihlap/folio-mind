import { createContext } from 'react';
import type { BackgroundUploadKind } from '@folio-mind/store';

export type VersionUploadSuccess = {
  documentId: string;
  versionId: string;
};

export type BackgroundUploadContextValue = {
  active: boolean;
  progress: number;
  fileLabel: string;
  showDone: boolean;
  error: string | null;
  clearError: () => void;
  uploadFromDashboard: (pdfFile: File, docxFile?: File, projectId?: string) => void;
  uploadFromDocxOnly: (docxFile: File, projectId?: string) => void;
  uploadNewDocument: (pdfFile: File, onCreated?: (documentId: string) => void) => void;
  uploadDocumentVersion: (
    documentId: string,
    pdfFile: File,
    docxFile?: File,
    onSuccess?: (result: VersionUploadSuccess) => void,
  ) => void;
  uploadDocumentVersionFromDocx: (
    documentId: string,
    docxFile: File,
    onSuccess?: (result: VersionUploadSuccess) => void,
  ) => void;
  uploadRegulation: (file: File, onSuccess?: () => void) => void;
  kind: BackgroundUploadKind | null;
};

export const BackgroundUploadContext = createContext<BackgroundUploadContextValue | null>(null);
