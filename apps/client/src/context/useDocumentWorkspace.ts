import { useContext } from 'react';
import { DocumentWorkspaceContext } from './document-workspace-context-value.js';

export function useDocumentWorkspace() {
  const ctx = useContext(DocumentWorkspaceContext);
  if (!ctx) {
    throw new Error('useDocumentWorkspace must be used within DocumentWorkspaceProvider');
  }
  return ctx;
}

export function useDocumentWorkspaceOptional() {
  return useContext(DocumentWorkspaceContext);
}
