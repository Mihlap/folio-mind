import { useEffect, useState } from 'react';
import {
  toUserErrorMessage,
  MSG_JOB_NOT_FOUND,
  useGetJobQuery,
  useLazySearchProjectMaterialsQuery,
  useRequestBookletTitleDraftMutation,
  type BookletTitleDraftResult,
} from '@folio-mind/store';
import { FeatureHelpButton } from '../ui/FeatureHelp.js';
import { reportActionBtnPrimary, reportActionsColumnClass } from '../ui/FeatureHelp.styles.js';
import type { LayoutEditorState } from '../../hooks/useLayoutEditor.js';
import {
  bookletTitleFieldsFromAi,
  EMPTY_BOOKLET_TITLE_FIELDS,
  loadBookletTitleDraft,
  saveBookletTitleDraft,
  type BookletTitleFields,
} from '../../lib/documents/booklet-title-draft.js';

type Props = {
  documentId: string;
  documentTitle: string;
  projectId?: string | null;
  projectName?: string | null;
  versionReady: boolean;
  layout?: LayoutEditorState;
  compact?: boolean;
};

export function DocumentBookletAiPanel({
  documentId,
  documentTitle,
  projectId,
  projectName,
  versionReady,
  layout,
  compact = false,
}: Props) {
  const [objectHint, setObjectHint] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [titleFields, setTitleFields] = useState<BookletTitleFields>(EMPTY_BOOKLET_TITLE_FIELDS);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [statusHint, setStatusHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [captionNotice, setCaptionNotice] = useState<string | null>(null);

  useEffect(() => {
    setTitleFields(loadBookletTitleDraft(documentId) ?? EMPTY_BOOKLET_TITLE_FIELDS);
  }, [documentId]);

  function updateTitleField<K extends keyof BookletTitleFields>(key: K, value: BookletTitleFields[K]) {
    setTitleFields((prev) => {
      const next = { ...prev, [key]: value };
      saveBookletTitleDraft(documentId, next);
      return next;
    });
  }

  function applyTitleFields(fields: BookletTitleFields) {
    setTitleFields(fields);
    saveBookletTitleDraft(documentId, fields);
  }

  const [requestTitleDraft, { isLoading: requestingTitle }] = useRequestBookletTitleDraftMutation();
  const [searchMaterials, { data: searchResult, isFetching: searching }] =
    useLazySearchProjectMaterialsQuery();

  const { data: job, isError: pollError } = useGetJobQuery(activeJobId!, {
    skip: !activeJobId,
    pollingInterval: activeJobId ? 2000 : 0,
  });

  useEffect(() => {
    if (pollError && !job && activeJobId) {
      setError(MSG_JOB_NOT_FOUND);
      setActiveJobId(null);
    }
  }, [pollError, job, activeJobId]);

  useEffect(() => {
    if (!job || !activeJobId) return;
    if (job.status === 'completed') {
      const payload = job.payload as BookletTitleDraftResult | null;
      if (payload?.title) {
        applyTitleFields(bookletTitleFieldsFromAi(payload));
        setStatusHint(payload.message ?? 'Черновик титульника готов — можно отредактировать поля ниже.');
      }
      setActiveJobId(null);
    }
    if (job.status === 'failed') {
      const payload = job.payload as { error?: string } | null;
      setError(
        toUserErrorMessage(payload?.error, 'Не удалось подготовить черновик. Проверьте, что ИИ настроен администратором.'),
      );
      setActiveJobId(null);
    }
  }, [job, activeJobId]);

  async function handleTitleDraft() {
    if (!versionReady) return;
    setError(null);
    setStatusHint(null);
    try {
      const result = await requestTitleDraft({
        documentId,
        projectName: projectName ?? undefined,
        objectHint: objectHint.trim() || titleFields.title.trim() || documentTitle,
      }).unwrap();
      setActiveJobId(result.jobId);
      setStatusHint('ИИ готовит черновик титульника…');
    } catch (err) {
      setError(
        toUserErrorMessage(err, 'Не удалось запустить черновик титульника. Проверьте, что ИИ настроен администратором.'),
      );
    }
  }

  function handleFillCaptions() {
    if (!layout) return;
    layout.autoFillCaptionsFromFilenames();
    setCaptionNotice('Пустые подписи заполнены из имён файлов. Проверьте текст в «Макет».');
  }

  async function handleSearch() {
    if (!projectId || !searchQuery.trim()) return;
    setError(null);
    try {
      await searchMaterials({ projectId, q: searchQuery.trim() }).unwrap();
    } catch (err) {
      setError(toUserErrorMessage(err, 'Не удалось выполнить поиск. Попробуйте ещё раз.'));
    }
  }

  const busy = requestingTitle || Boolean(activeJobId);

  return (
    <div className="space-y-4 text-sm text-slate-700">
      {!compact && (
        <p className="text-xs text-slate-500">
          Подписи к рендерам, черновик текста титульника и поиск файлов по проекту.
        </p>
      )}

      <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-800">Подписи к рендерам</span>
          <FeatureHelpButton title="Автоподписи">
            <p>При вставке картинки подпись берётся из имени файла (без расширения).</p>
            <p>Текст можно изменить в «Макет» у выбранного изображения.</p>
          </FeatureHelpButton>
        </div>
        <p className="text-[11px] text-slate-500">
          Пример: «render_north_view.jpg» → «render north view».
        </p>
        {layout && (
          <button
            type="button"
            disabled={!layout.totalObjectCount}
            onClick={handleFillCaptions}
            className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            Заполнить пустые подписи из имён файлов
          </button>
        )}
        {captionNotice && <p className="text-xs text-emerald-700">{captionNotice}</p>}
      </div>

      <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-3 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-800">Черновик титульника</span>
          <FeatureHelpButton title="Черновик титульника">
            <p>
              Впишите заголовок, подзаголовок и слоган вручную или нажмите «Сгенерировать черновик» —
              ИИ заполнит поля, их можно сразу поправить.
            </p>
            <p>Готовый текст перенесите на титульную страницу в «Макет».</p>
          </FeatureHelpButton>
        </div>

        <label className="block text-xs text-slate-600">
          Заголовок
          <input
            value={titleFields.title}
            onChange={(e) => updateTitleField('title', e.target.value)}
            placeholder="Например: Архитектурное бюро: инновации и стиль"
            disabled={!versionReady}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm"
          />
        </label>

        <label className="block text-xs text-slate-600">
          Подзаголовок
          <input
            value={titleFields.subtitle}
            onChange={(e) => updateTitleField('subtitle', e.target.value)}
            placeholder="Буклет"
            disabled={!versionReady}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm"
          />
        </label>

        <label className="block text-xs text-slate-600">
          Слоган <span className="text-slate-400">(необязательно)</span>
          <input
            value={titleFields.tagline}
            onChange={(e) => updateTitleField('tagline', e.target.value)}
            placeholder="Короткая фраза под заголовком"
            disabled={!versionReady}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm"
          />
        </label>

        <label className="block text-xs text-slate-600">
          Подсказка для ИИ <span className="text-slate-400">(необязательно)</span>
          <input
            value={objectHint}
            onChange={(e) => setObjectHint(e.target.value)}
            placeholder={
              titleFields.title.trim() || documentTitle || 'Объект, стиль, назначение буклета'
            }
            disabled={busy || !versionReady}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm"
          />
        </label>

        <div className={reportActionsColumnClass}>
          <button
            type="button"
            disabled={!versionReady || busy}
            onClick={() => void handleTitleDraft()}
            className={reportActionBtnPrimary}
          >
            {busy ? 'ИИ думает…' : 'Сгенерировать черновик'}
          </button>
        </div>

        {(titleFields.title || titleFields.subtitle || titleFields.tagline) && (
          <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-800">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Как будет на титуле
            </p>
            {titleFields.title ? <p className="font-semibold">{titleFields.title}</p> : null}
            {titleFields.subtitle ? <p className="mt-1 opacity-90">{titleFields.subtitle}</p> : null}
            {titleFields.tagline ? <p className="mt-1 italic opacity-80">{titleFields.tagline}</p> : null}
          </div>
        )}
      </div>

      {projectId ? (
        <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-3 space-y-2">
          <span className="text-xs font-medium text-slate-800">Поиск по проекту</span>
          <div className="flex gap-2">
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSearch();
              }}
              placeholder="Название документа или файла"
              className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 py-2 text-sm"
            />
            <button
              type="button"
              disabled={!searchQuery.trim() || searching}
              onClick={() => void handleSearch()}
              className="shrink-0 cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              {searching ? '…' : 'Найти'}
            </button>
          </div>
          {searchResult && (
            <div className="space-y-2 text-xs">
              {searchResult.documents.length > 0 && (
                <div>
                  <p className="font-medium text-slate-600">Документы</p>
                  <ul className="mt-1 space-y-0.5 text-slate-700">
                    {searchResult.documents.map((doc) => (
                      <li key={doc.id}>{doc.title}</li>
                    ))}
                  </ul>
                </div>
              )}
              {searchResult.media.length > 0 && (
                <div>
                  <p className="font-medium text-slate-600">Медиа</p>
                  <ul className="mt-1 space-y-0.5 text-slate-700">
                    {searchResult.media.map((item) => (
                      <li key={item.id}>
                        {item.title || item.fileName}
                        {item.title && item.fileName !== item.title ? (
                          <span className="text-slate-400"> · {item.fileName}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {searchResult.documents.length === 0 && searchResult.media.length === 0 && (
                <p className="text-slate-500">Ничего не найдено по запросу «{searchResult.query}».</p>
              )}
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-slate-500">
          Привяжите документ к проекту — здесь можно искать другие PDF и картинки по названию.
        </p>
      )}

      {statusHint && <p className="text-xs text-slate-600">{statusHint}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
