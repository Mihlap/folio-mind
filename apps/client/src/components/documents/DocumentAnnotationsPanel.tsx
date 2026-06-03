import { useEffect, useState } from 'react';
import {
  useCreateAnnotationMutation,
  useDeleteAnnotationMutation,
  useListAnnotationsQuery,
} from '@folio-mind/store';
import {
  FeatureHelpActionButton,
  PanelSectionHeader,
  reportActionBtnPrimary,
  reportActionsColumnClass,
} from '../ui/FeatureHelp.js';

type Props = {
  documentId: string;
  versionId: string;
  viewerPage: number;
  versionReady: boolean;
  onGoToPage: (page: number) => void;
};

export function DocumentAnnotationsPanel({
  documentId,
  versionId,
  viewerPage,
  versionReady,
  onGoToPage,
}: Props) {
  const { data, refetch } = useListAnnotationsQuery(
    { documentId, versionId },
    { skip: !versionId },
  );
  const [createAnnotation, { isLoading: creating }] = useCreateAnnotationMutation();
  const [deleteAnnotation] = useDeleteAnnotationMutation();
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setContent('');
    setError(null);
  }, [versionId]);

  const items = data?.items ?? [];
  const userComments = items.filter((a) => a.kind === 'comment' || a.kind === 'highlight');
  const acceptedEdits = items.filter((a) => a.kind === 'accepted_edit');

  async function handleAdd() {
    const text = content.trim();
    if (!text) return;
    setError(null);
    try {
      await createAnnotation({
        documentId,
        versionId,
        page: viewerPage,
        content: text,
        kind: 'comment',
      }).unwrap();
      setContent('');
      void refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить заметку');
    }
  }

  return (
    <div className="space-y-3">
      <PanelSectionHeader
        title="Аннотации"
        helpTitle="Аннотации"
        helpContent={
          <>
            <p>
              Заметки привязаны к номеру страницы открытой версии. Текст в поле сохраняется для
              текущей страницы просмотрщика.
            </p>
            <p>
              Сюда попадают принятые правки с вкладки «Отчёт». Чтобы получить PDF с пометками, нажмите
              там «Собрать PDF с правками» — создастся новая версия.
            </p>
          </>
        }
      />

      <div className="flex flex-col gap-2">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          disabled={!versionReady || creating}
          placeholder={`Заметка к стр. ${viewerPage}…`}
          rows={2}
          className="w-full max-w-md resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-50"
        />
        <div className={reportActionsColumnClass}>
          <FeatureHelpActionButton
            helpTitle="Добавить заметку"
            disabled={!versionReady || creating || !content.trim()}
            onClick={() => void handleAdd()}
            buttonClassName={reportActionBtnPrimary}
            helpContent={
              <>
                <p>
                  Сохраняет комментарий к странице {viewerPage} выбранной версии. Позже заметку
                  можно удалить крестиком в списке.
                </p>
                <p>Нужна готовая версия документа.</p>
              </>
            }
          >
            {creating ? 'Сохранение…' : `Добавить к стр. ${viewerPage}`}
          </FeatureHelpActionButton>
        </div>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}

      {userComments.length > 0 && (
        <ul className="space-y-2">
          {userComments.map((item) => (
            <li key={item.id} className="rounded-lg border border-slate-200 bg-white p-2">
              <div className="flex items-start gap-2">
                <button
                  type="button"
                  onClick={() => onGoToPage(item.page)}
                  className="cursor-pointer shrink-0 text-[11px] font-medium text-folio-700 hover:underline"
                >
                  стр. {item.page}
                </button>
                <p className="min-w-0 flex-1 text-xs text-slate-700">{item.content}</p>
                <button
                  type="button"
                  title="Удалить"
                  onClick={async () => {
                    await deleteAnnotation({
                      documentId,
                      versionId,
                      annotationId: item.id,
                    });
                    void refetch();
                  }}
                  className="cursor-pointer shrink-0 text-xs text-slate-400 hover:text-red-600"
                >
                  ×
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {acceptedEdits.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium text-slate-600">Принятые правки</p>
          <ul className="space-y-2">
            {acceptedEdits.map((item) => (
              <li key={item.id} className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-2">
                <button
                  type="button"
                  onClick={() => onGoToPage(item.page)}
                  className="cursor-pointer text-[11px] font-medium text-folio-700 hover:underline"
                >
                  стр. {item.page}
                </button>
                {item.quote && (
                  <p className="mt-1 text-[11px] text-slate-500 line-through">{item.quote}</p>
                )}
                <p className="mt-1 text-xs text-emerald-900">{item.content}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {items.length === 0 && (
        <p className="text-[11px] text-slate-400">Пока нет аннотаций для этой версии</p>
      )}
    </div>
  );
}
