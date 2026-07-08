import type { DragEvent } from 'react';
import { startDocumentDrag } from '../../lib/documents/documentDrag.js';

type Props = {
  documentId: string;
  title: string;
  onDragStateChange?: (dragging: boolean) => void;
  className?: string;
};

export function DocumentDragHandle({
  documentId,
  title,
  onDragStateChange,
  className = '',
}: Props) {
  return (
    <button
      type="button"
      draggable
      onDragStart={(event: DragEvent) => {
        startDocumentDrag(event, { id: documentId, title });
        onDragStateChange?.(true);
      }}
      onDragEnd={() => onDragStateChange?.(false)}
      className={[
        'shrink-0 cursor-grab rounded-md border border-transparent px-1.5 py-2 text-slate-400 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-600 active:cursor-grabbing',
        className,
      ].join(' ')}
      title="Перетащите в проект"
      aria-label={`Перетащить «${title}» в проект`}
      onClick={(event) => event.preventDefault()}
    >
      ⠿
    </button>
  );
}
