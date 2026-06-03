import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { DocumentVersionItem } from '../components/documents/DocumentVersionsPanel.js';

export type DocumentWorkspaceData = {
  documentId: string;
  title: string;
  versions: DocumentVersionItem[];
  selectedVersionId: string | undefined;
  onSelectVersion: (versionId: string) => void;
  onRequestNewVersion: () => void;
  uploadingNewVersion: boolean;
  uploadError?: string | null;
  uploadStatusHint?: string | null;
};

type DocumentWorkspaceContextValue = {
  workspace: DocumentWorkspaceData | null;
  setWorkspace: (data: DocumentWorkspaceData | null) => void;
};

const DocumentWorkspaceContext = createContext<DocumentWorkspaceContextValue | null>(null);

export function DocumentWorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspace, setWorkspaceState] = useState<DocumentWorkspaceData | null>(null);
  const setWorkspace = useCallback((data: DocumentWorkspaceData | null) => {
    setWorkspaceState(data);
  }, []);

  const value = useMemo(() => ({ workspace, setWorkspace }), [workspace, setWorkspace]);

  return (
    <DocumentWorkspaceContext.Provider value={value}>{children}</DocumentWorkspaceContext.Provider>
  );
}

export function useDocumentWorkspace() {
  const ctx = useContext(DocumentWorkspaceContext);
  if (!ctx) {
    throw new Error('useDocumentWorkspace must be used within DocumentWorkspaceProvider');
  }
  return ctx;
}

/** Безопасный доступ из AppShell (вне страницы документа workspace может быть null). */
export function useDocumentWorkspaceOptional() {
  return useContext(DocumentWorkspaceContext);
}
