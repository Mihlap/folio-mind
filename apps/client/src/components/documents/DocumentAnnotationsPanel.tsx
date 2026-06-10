import { useEffect, useRef, useState } from 'react';
import {
  useApplyAcceptedSuggestionsMutation,
  useCreateAnnotationMutation,
  useDeleteAnnotationMutation,
  useGetJobQuery,
  useListAnnotationsQuery,
} from '@folio-mind/store';
import {
  FeatureHelpActionButton,
  PanelSectionHeader,
  reportActionBtnHighlight,
  reportActionBtnPrimary,
  reportActionsColumnClass,
} from '../ui/FeatureHelp.js';

type Props = {
  documentId: string;
  versionId: string;
  viewerPage: number;
  versionReady: boolean;
  onGoToPage: (page: number, annotationId?: string) => void;
  onOpenAcceptedEdit: (page: number, annotationId: string) => void;
  onOpenAllAcceptedEdits: () => void;
  onSelectVersion: (versionId: string) => void;
  focusedAnnotationId?: string | null;
  injectedEditBefore?: string | null;
};

export function DocumentAnnotationsPanel({
  documentId,
  versionId,
  viewerPage,
  versionReady,
  onGoToPage,
  onOpenAcceptedEdit,
  onOpenAllAcceptedEdits,
  onSelectVersion,
  focusedAnnotationId = null,
  injectedEditBefore = null,
}: Props) {
  const { data, refetch } = useListAnnotationsQuery(
    { documentId, versionId },
    { skip: !versionId },
  );
  const [createAnnotation, { isLoading: creating }] = useCreateAnnotationMutation();
  const [deleteAnnotation] = useDeleteAnnotationMutation();
  const [applyAccepted, { isLoading: applying }] = useApplyAcceptedSuggestionsMutation();
  const [content, setContent] = useState('');
  const [editBefore, setEditBefore] = useState('');
  const [editAfter, setEditAfter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [applyJobId, setApplyJobId] = useState<string | null>(null);
  const [pollApply, setPollApply] = useState(false);
  const [applyHint, setApplyHint] = useState<string | null>(null);
  const itemRefs = useRef<Map<string, HTMLLIElement>>(new Map());

  const { data: applyJob } = useGetJobQuery(applyJobId!, {
    skip: !applyJobId,
    pollingInterval: pollApply ? 2000 : 0,
  });

  useEffect(() => {
    setContent('');
    setEditBefore('');
    setEditAfter('');
    setError(null);
    setApplyJobId(null);
    setPollApply(false);
    setApplyHint(null);
  }, [versionId]);

  useEffect(() => {
    if (!applyJob) return;
    if (applyJob.status === 'completed') {
      setPollApply(false);
      setApplyHint('Новая версия с правками готова — откройте её в списке версий слева.');
    }
    if (applyJob.status === 'failed') {
      setPollApply(false);
      setApplyHint(
        typeof applyJob.payload === 'object' &&
          applyJob.payload &&
          'error' in applyJob.payload
          ? String((applyJob.payload as { error?: string }).error)
          : 'Не удалось собрать PDF с правками',
      );
    }
  }, [applyJob]);

  useEffect(() => {
    if (!focusedAnnotationId) return;
    const el = itemRefs.current.get(focusedAnnotationId);
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [focusedAnnotationId]);

  useEffect(() => {
    if (!injectedEditBefore) return;
    setEditBefore(injectedEditBefore);
    setError(null);
  }, [injectedEditBefore]);

  const items = data?.items ?? [];
  const userComments = items.filter((a) => a.kind === 'comment' || a.kind === 'highlight');
  const acceptedEdits = items.filter((a) => a.kind === 'accepted_edit');

  async function handleAddComment() {
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

  async function handleAddManualEdit() {
    const before = editBefore.trim();
    const after = editAfter.trim();
    if (!before || !after) return;
    setError(null);
    try {
      await createAnnotation({
        documentId,
        versionId,
        page: viewerPage,
        content: after,
        quote: before,
        kind: 'accepted_edit',
      }).unwrap();
      setEditBefore('');
      setEditAfter('');
      void refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить правку');
    }
  }

  async function handleApplyPdf() {
    setError(null);
    setApplyHint(null);
    try {
      const result = await applyAccepted({ documentId, versionId }).unwrap();
      setApplyJobId(result.operationJobId);
      setPollApply(true);
      onSelectVersion(result.versionId);
      setApplyHint(`Создана версия ${result.version}. Собираем PDF…`);
    } catch (err) {
      const msg =
        typeof err === 'object' && err && 'data' in err
          ? typeof (err as { data: unknown }).data === 'string'
            ? (err as { data: string }).data
            : 'Не удалось собрать PDF с правками'
          : 'Не удалось собрать PDF с правками';
      setError(msg);
    }
  }

  return (
    <div className="space-y-4">
      <PanelSectionHeader
        title="Аннотации"
        helpTitle="Аннотации"
        helpContent={
          <>
            <p>
              <strong>Заметка</strong> — комментарий к странице (метка на PDF).{' '}
              <strong>Своя правка</strong> — вы сами указываете «было» и «стало»; полный текст в
              всплывающем окне.
            </p>
            <p>
              Правки от ИИ появляются после «Принять» во вкладке «Отчёт». Сборка PDF — «Собрать PDF
              с правками».
            </p>
          </>
        }
      />

      <div className="space-y-2">
        <p className="text-xs font-medium text-slate-600">Заметка к стр. {viewerPage}</p>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          disabled={!versionReady || creating}
          placeholder="Комментарий без замены текста…"
          rows={2}
          className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-50"
        />
        <FeatureHelpActionButton
          helpTitle="Добавить заметку"
          disabled={!versionReady || creating || !content.trim()}
          onClick={() => void handleAddComment()}
          buttonClassName={reportActionBtnPrimary}
          helpContent={<p>Короткий комментарий к текущей странице viewer.</p>}
        >
          {creating ? 'Сохранение…' : 'Добавить заметку'}
        </FeatureHelpActionButton>
      </div>

      <div className="space-y-2 border-t border-slate-100 pt-4">
        <p className="text-xs font-medium text-slate-600">Своя правка к стр. {viewerPage}</p>
        <p className="text-[11px] text-slate-500">
          Выделите фрагмент в PDF → «В правку «было»» — текст попадёт в поле ниже.
        </p>
        <textarea
          value={editBefore}
          onChange={(e) => setEditBefore(e.target.value)}
          disabled={!versionReady || creating}
          placeholder="Было (исходный текст)…"
          rows={2}
          className="w-full resize-none rounded-lg border border-red-100 bg-red-50/50 px-3 py-2 text-sm disabled:opacity-50"
        />
        <textarea
          value={editAfter}
          onChange={(e) => setEditAfter(e.target.value)}
          disabled={!versionReady || creating}
          placeholder="Стало (новая формулировка)…"
          rows={2}
          className="w-full resize-none rounded-lg border border-emerald-100 bg-emerald-50/50 px-3 py-2 text-sm disabled:opacity-50"
        />
        <div className={reportActionsColumnClass}>
          <FeatureHelpActionButton
            helpTitle="Сохранить правку"
            disabled={!versionReady || creating || !editBefore.trim() || !editAfter.trim()}
            onClick={() => void handleAddManualEdit()}
            buttonClassName={reportActionBtnPrimary}
            helpContent={
              <p>
                Сохраняет пару «было / стало» как правку. На PDF — чип «Правки» с числом в углу
                страницы; полный текст — во всплывающем окне.
              </p>
            }
          >
            {creating ? 'Сохранение…' : 'Сохранить правку'}
          </FeatureHelpActionButton>
        </div>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {userComments.length > 0 && (
        <ul className="space-y-2 border-t border-slate-100 pt-3">
          <p className="text-xs font-medium text-slate-600">Заметки</p>
          {userComments.map((item) => (
            <li
              key={item.id}
              ref={(el) => {
                if (el) itemRefs.current.set(item.id, el);
                else itemRefs.current.delete(item.id);
              }}
              className={`rounded-lg border bg-white p-2 transition-shadow ${
                focusedAnnotationId === item.id
                  ? 'border-folio-500 ring-2 ring-folio-200 shadow-sm'
                  : 'border-slate-200 hover:border-folio-200'
              }`}
            >
              <div className="flex items-start gap-2">
                <button
                  type="button"
                  onClick={() => onGoToPage(item.page, item.id)}
                  className="min-w-0 flex-1 cursor-pointer text-left"
                >
                  <span className="text-[11px] font-medium text-folio-700">
                    стр. {item.page}
                  </span>
                  <p className="mt-0.5 text-xs text-slate-700">{item.content}</p>
                </button>
                <button
                  type="button"
                  title="Удалить"
                  onClick={() => {
                    void (async () => {
                      await deleteAnnotation({
                        documentId,
                        versionId,
                        annotationId: item.id,
                      });
                      void refetch();
                    })();
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
        <div className="space-y-2 border-t border-slate-100 pt-3">
          <p className="text-[11px] text-slate-500">
            Полный текст — «Правки» над PDF или «Открыть все» здесь. После «Собрать PDF» в
            приложении в конце файла — компактный реестр (краткие фрагменты), без блоков на страницах.
          </p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-slate-600">
              Правки «было / стало» ({acceptedEdits.length})
            </p>
            <button
              type="button"
              onClick={onOpenAllAcceptedEdits}
              className="cursor-pointer rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-emerald-700"
            >
              Открыть все
            </button>
          </div>

          <div className={reportActionsColumnClass}>
            <FeatureHelpActionButton
              helpTitle="Собрать PDF с правками"
              disabled={!versionReady || creating || applying || pollApply}
              onClick={() => void handleApplyPdf()}
              buttonClassName={reportActionBtnHighlight}
              helpContent={
                <>
                  <p>
                    Создаёт новую версию: текст страниц договора не меняется; в приложении —
                    компактный реестр (страница + краткие фрагменты) по всем принятым правкам ИИ и
                    ручным из «Аннотации».
                  </p>
                  <p>
                    Исходный текст в PDF не переписывается автоматически — это рабочая версия для
                    согласования. Для финального договора правки вносят в Word и загружают новый PDF.
                  </p>
                </>
              }
            >
              {applying || pollApply ? 'Сборка PDF…' : 'Собрать PDF с правками'}
            </FeatureHelpActionButton>
          </div>

          {applyHint && <p className="text-xs text-folio-700">{applyHint}</p>}

          <ul className="space-y-1.5">
            {acceptedEdits.map((item) => (
              <li
                key={item.id}
                ref={(el) => {
                  if (el) itemRefs.current.set(item.id, el);
                  else itemRefs.current.delete(item.id);
                }}
              >
                <button
                  type="button"
                  onClick={() => onOpenAcceptedEdit(item.page, item.id)}
                  className={`w-full cursor-pointer rounded-lg border px-2 py-1.5 text-left text-xs transition ${
                    focusedAnnotationId === item.id
                      ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-200'
                      : 'border-emerald-200 bg-emerald-50/40 hover:border-emerald-400'
                  }`}
                >
                  <span className="font-medium text-folio-700">стр. {item.page}</span>
                  <span className="mt-0.5 block truncate text-slate-600">
                    {item.quote ? item.quote : item.content}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {items.length === 0 && (
        <p className="text-[11px] text-slate-400">
          Пока нет записей. Добавьте заметку или свою правку к текущей странице.
        </p>
      )}
    </div>
  );
}
