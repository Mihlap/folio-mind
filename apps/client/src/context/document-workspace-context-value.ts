import { createContext } from 'react';
import type { DocumentVersionItem } from '../components/documents/DocumentVersionsPanel.js';

export type DocumentWorkspaceData = {
  documentId: string;
  title: string;
  documentRole: string | null;
  versions: DocumentVersionItem[];
  selectedVersionId: string | undefined;
  onSelectVersion: (versionId: string) => void;
  onRequestNewVersion: () => void;
  onRequestNewDocxVersion: () => void;
  uploadingNewVersion: boolean;
  uploadError?: string | null;
  uploadStatusHint?: string | null;
};

export type DocumentWorkspaceContextValue = {
  workspace: DocumentWorkspaceData | null;
  setWorkspace: (data: DocumentWorkspaceData | null) => void;
};

export const DocumentWorkspaceContext = createContext<DocumentWorkspaceContextValue | null>(null);
