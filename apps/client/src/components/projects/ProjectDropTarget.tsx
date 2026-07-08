import { useState, type DragEvent, type ReactNode } from 'react';
import { useUpdateDocumentProjectMutation } from '@folio-mind/store';
import { allowDocumentDrop, readDocumentDragPayload } from '../../lib/documents/documentDrag.js';

type Props = {
  projectId: string | null;
  projectName: string;
  onAssigned?: () => void;
  className?: string;
  activeClassName?: string;
  children: ReactNode;
};

export function ProjectDropTarget({
  projectId,
  projectName,
  onAssigned,
  className = '',
  activeClassName = 'ring-2 ring-folio-400 bg-folio-50/80',
  children,
}: Props) {
  const [updateProject, { isLoading }] = useUpdateDocumentProjectMutation();
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDrop(event: DragEvent) {
    event.preventDefault();
    setDragOver(false);
    const payload = readDocumentDragPayload(event);
    if (!payload) return;
    setError(null);
    try {
      await updateProject({ documentId: payload.documentId, projectId }).unwrap();
      onAssigned?.();
    } catch {
      setError('Не удалось переместить документ');
    }
  }

  return (
    <div
      className={[
        className,
        dragOver ? activeClassName : '',
        isLoading ? 'opacity-60' : '',
      ].join(' ')}
      onDragOver={(event) => {
        allowDocumentDrop(event);
        setDragOver(true);
      }}
      onDragLeave={(event) => {
        const next = event.relatedTarget as Node | null;
        if (next && event.currentTarget.contains(next)) return;
        setDragOver(false);
      }}
      onDrop={(event) => void handleDrop(event)}
      title={`Перетащите документ в проект «${projectName}»`}
    >
      {children}
      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
