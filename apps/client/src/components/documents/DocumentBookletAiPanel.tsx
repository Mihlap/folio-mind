import { useEffect, useState } from 'react';
import {
  useGetJobQuery,
  useLazySearchProjectMaterialsQuery,
  useRequestBookletTitleDraftMutation,
  type BookletTitleDraftResult,
} from '@folio-mind/store';
import { FeatureHelpButton } from '../ui/FeatureHelp.js';
import { reportActionBtnPrimary, reportActionsColumnClass } from '../ui/FeatureHelp.styles.js';
import type { LayoutEditorState } from '../../hooks/useLayoutEditor.js';

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
  const [titleDraft, setTitleDraft] = useState<BookletTitleDraftResult | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [statusHint, setStatusHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [captionNotice, setCaptionNotice] = useState<string | null>(null);

  const [requestTitleDraft, { isLoading: requestingTitle }] = useRequestBookletTitleDraftMutation();
  const [searchMaterials, { data: searchResult, isFetching: searching }] =
    useLazySearchProjectMaterialsQuery();

  const { data: job } = useGetJobQuery(activeJobId!, {
    skip: !activeJobId,
    pollingInterval: activeJobId ? 2000 : 0,
  });

  useEffect(() => {
    if (!job || !activeJobId) return;
    if (job.status === 'completed') {
      const payload = job.payload as BookletTitleDraftResult | null;
      if (payload?.title) {
        setTitleDraft({
          title: payload.title,
          subtitle: payload.subtitle ?? 'Буклет',
          tagline: payload.tagline ?? '',
          message: payload.message,
        });
        setStatusHint(payload.message ?? 'Черновик титульника готов.');
      }
      setActiveJobId(null);
    }
    if (job.status === 'failed') {
      const payload = job.payload as { error?: string } | null;
      setError(payload?.error ?? 'Не удалось подготовить черновик. Проверьте, что ИИ настроен администратором.');
      setActiveJobId(null);
    }
  }, [job, activeJobId]);

  async function handleTitleDraft() {
    if (!versionReady) return;
    setError(null);
    setStatusHint(null);
    setTitleDraft(null);
    try {
      const result = await requestTitleDraft({
        documentId,
        projectName: projectName ?? undefined,
        objectHint: objectHint.trim() || documentTitle,
      }).unwrap();
      setActiveJobId(result.jobId);
      setStatusHint('ИИ готовит черновик титульника…');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Не удалось запустить черновик титульника. Проверьте, что ИИ настроен администратором.',
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
      setError(err instanceof Error ? err.message : 'Не удалось выполнить поиск. Попробуйте ещё раз.');
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

      <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-800">Черновик титульника</span>
          <FeatureHelpButton title="Черновик титульника">
            <p>ИИ предложит заголовок, подзаголовок и короткий слоган. Текст нужно вручную перенести на титульную страницу в «Макет».</p>
          </FeatureHelpButton>
        </div>
        <label className="block text-xs text-slate-600">
          Подсказка (необязательно)
          <input
            value={objectHint}
            onChange={(e) => setObjectHint(e.target.value)}
            placeholder={documentTitle}
            disabled={busy || !versionReady}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm"
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
        {titleDraft && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-900">
            <p className="font-semibold">{titleDraft.title}</p>
            {titleDraft.subtitle && <p className="mt-1 opacity-90">{titleDraft.subtitle}</p>}
            {titleDraft.tagline && <p className="mt-1 italic opacity-80">{titleDraft.tagline}</p>}
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
