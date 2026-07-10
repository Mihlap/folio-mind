import { useMemo, useState } from 'react';
import {
  useCreateAnnotationMutation,
  useDeleteAnnotationMutation,
  useListAnnotationsQuery,
  useUpdateAnnotationMutation,
  type DocumentAnnotation,
} from '@folio-mind/store';

type Props = {
  documentId: string;
  versionId: string;
  viewerPage: number;
  versionReady: boolean;
  canEdit: boolean;
};

const INTERNAL_KINDS = ['internal_arrow', 'internal_frame'] as const;

function isInternalKind(kind: string): boolean {
  return (INTERNAL_KINDS as readonly string[]).includes(kind);
}

export function DocumentInternalMarkupPanel({
  documentId,
  versionId,
  viewerPage,
  versionReady,
  canEdit,
}: Props) {
  const { data } = useListAnnotationsQuery({ documentId, versionId }, { skip: !versionId });
  const [createAnnotation, { isLoading: creating }] = useCreateAnnotationMutation();
  const [updateAnnotation] = useUpdateAnnotationMutation();
  const [deleteAnnotation] = useDeleteAnnotationMutation();
  const [error, setError] = useState<string | null>(null);

  const internalItems = useMemo(
    () => (data?.items ?? []).filter((item) => isInternalKind(item.kind)),
    [data?.items],
  );

  async function addMarkup(kind: 'internal_arrow' | 'internal_frame') {
    if (!versionReady || !canEdit) return;
    setError(null);
    try {
      await createAnnotation({
        documentId,
        versionId,
        page: viewerPage,
        kind,
        content: kind === 'internal_arrow' ? 'Стрелка' : 'Рамка',
        hideOnExport: true,
      }).unwrap();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось добавить пометку');
    }
  }

  async function toggleHideOnExport(item: DocumentAnnotation) {
    await updateAnnotation({
      documentId,
      versionId,
      annotationId: item.id,
      hideOnExport: !item.hideOnExport,
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] leading-snug text-slate-500">
        Внутренние пометки видны только команде. С флагом «скрыть при экспорте» они не попадут в
        материалы для заказчика.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!versionReady || !canEdit || creating}
          onClick={() => void addMarkup('internal_arrow')}
          className="cursor-pointer rounded-lg border border-slate-200 px-3 py-1.5 text-xs hover:bg-slate-50 disabled:opacity-50"
        >
          + Стрелка (стр. {viewerPage})
        </button>
        <button
          type="button"
          disabled={!versionReady || !canEdit || creating}
          onClick={() => void addMarkup('internal_frame')}
          className="cursor-pointer rounded-lg border border-slate-200 px-3 py-1.5 text-xs hover:bg-slate-50 disabled:opacity-50"
        >
          + Рамка (стр. {viewerPage})
        </button>
      </div>
      {internalItems.length > 0 ? (
        <ul className="max-h-40 space-y-1.5 overflow-y-auto">
          {internalItems.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center gap-2 rounded border border-slate-200 px-2 py-1 text-xs"
            >
              <span className="text-slate-700">
                стр. {item.page} · {item.kind === 'internal_arrow' ? 'стрелка' : 'рамка'}
              </span>
              <label className="flex items-center gap-1 text-slate-600">
                <input
                  type="checkbox"
                  checked={item.hideOnExport}
                  disabled={!canEdit}
                  onChange={() => void toggleHideOnExport(item)}
                />
                Скрыть при экспорте
              </label>
              {canEdit && (
                <button
                  type="button"
                  onClick={() =>
                    void deleteAnnotation({ documentId, versionId, annotationId: item.id })
                  }
                  className="ml-auto cursor-pointer text-rose-700"
                >
                  Удалить
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-500">Пометок пока нет.</p>
      )}
      {error && <p className="text-xs text-rose-700">{error}</p>}
    </div>
  );
}
