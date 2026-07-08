import { useCallback, useMemo, useState, type ReactNode } from 'react';
import {
  DocumentWorkspaceContext,
  type DocumentWorkspaceData,
} from './document-workspace-context-value.js';

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
