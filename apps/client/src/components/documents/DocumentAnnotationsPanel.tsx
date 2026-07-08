import { createContext, useContext, type ReactNode } from 'react';
import { FeatureHelpActionButton, PanelSectionHeader } from '../ui/FeatureHelp.js';
import {
  reportActionBtnHighlight,
  reportActionBtnPrimary,
  reportActionsColumnClass,
} from '../ui/FeatureHelp.styles.js';
import { DownloadIcon } from '../ui/icons/DownloadIcon.js';
import { ExpandableEditField } from './ExpandableEditField.js';
import { DocumentVersionConfidenceBadge } from './DocumentVersionConfidenceBadge.js';
import {
  useDocumentAnnotationsPanel,
  type DocumentAnnotationsController,
  type DocumentAnnotationsRootProps,
} from './useDocumentAnnotationsPanel.js';

const DocumentAnnotationsContext = createContext<DocumentAnnotationsController | null>(null);

export function DocumentAnnotationsControllerProvider({
  value,
  children,
}: {
  value: DocumentAnnotationsController;
  children: ReactNode;
}) {
  return (
    <DocumentAnnotationsContext.Provider value={value}>
      {children}
    </DocumentAnnotationsContext.Provider>
  );
}

export function DocumentAnnotationsRoot({
  children,
  ...props
}: DocumentAnnotationsRootProps & { children: ReactNode }) {
  const controller = useDocumentAnnotationsPanel(props);
  return (
    <DocumentAnnotationsControllerProvider value={controller}>
      {children}
    </DocumentAnnotationsControllerProvider>
  );
}

type PanelProps = {
  variant: 'notes' | 'edits';
  hideSectionHeader?: boolean;
};

export function DocumentAnnotationsPanel({ variant, hideSectionHeader = false }: PanelProps) {
  const c = useContext(DocumentAnnotationsContext);
  if (!c) {
    throw new Error('DocumentAnnotationsPanel must be used inside DocumentAnnotationsRoot');
  }

  const {
    documentId,
    versionId,
    viewerPage,
    versionReady,
    focusedAnnotationId,
    onGoToPage,
    onOpenAcceptedEdit,
    onOpenAllAcceptedEdits,
    creating,
    applying,
    applyingFinal,
    exportingHighlight,
    pollApply,
    pollExportHighlight,
    content,
    setContent,
    editBefore,
    setEditBefore,
    editAfter,
    setEditAfter,
    error,
    applyHint,
    applyJob,
    applyEditResults,
    applyConfidenceLevel,
    applyConfidenceScore,
    applyConfidenceSummary,
    hasSourceDocx,
    userComments,
    acceptedEdits,
    itemRefs,
    deleteAnnotation,
    refetch,
    handleAddComment,
    handleAddManualEdit,
    handleExportHighlightDocx,
    handleApplyFinal,
    handleDownloadPdf,
    handleDownloadDocx,
    handleApplyPdf,
  } = c;

  return (
    <div className="space-y-4">
      {!hideSectionHeader && variant === 'notes' && (
        <PanelSectionHeader
          title="Аннотации"
          helpTitle="Аннотации"
          helpContent={
            <p>
              <strong>Заметка</strong> — комментарий к странице (метка на PDF), без изменения текста
              договора.
            </p>
          }
        />
      )}
      {!hideSectionHeader && variant === 'edits' && (
        <PanelSectionHeader
          title="Правки в PDF"
          helpTitle="Правки в PDF"
          helpContent={
            <p>
              Зафиксируйте «было / стало» вручную или примите предложения ИИ в этом же разделе.
              Затем соберите новую версию PDF или выгрузите DOCX с подсветкой.
            </p>
          }
        />
      )}

      {variant === 'notes' && (
        <>
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
              helpContent={<p>Короткий комментарий к открытой сейчас странице.</p>}
            >
              {creating ? 'Сохранение…' : 'Добавить заметку'}
            </FeatureHelpActionButton>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          {userComments.length > 0 ? (
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
                      className="cursor-pointer shrink-0 text-lg text-slate-400 hover:text-red-600"
                    >
                      ✕
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] text-slate-400">Пока нет заметок к этой версии.</p>
          )}
        </>
      )}

      {variant === 'edits' && (
        <>
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-600">Своя правка к стр. {viewerPage}</p>
            <p className="text-[11px] text-slate-500">
              Выделите фрагмент в PDF → «В правку «было»» — текст попадёт в поле ниже.
            </p>
            <ExpandableEditField
              label="Было (исходный текст)"
              value={editBefore}
              onChange={setEditBefore}
              disabled={!versionReady || creating}
              placeholder="Было (исходный текст)…"
              fieldClassName="w-full rounded-lg border border-red-100 bg-red-50/50 px-3 py-2 text-sm disabled:opacity-50"
            />
            <ExpandableEditField
              label="Стало (новая формулировка)"
              value={editAfter}
              onChange={setEditAfter}
              disabled={!versionReady || creating}
              placeholder="Стало (новая формулировка)…"
              fieldClassName="w-full rounded-lg border border-emerald-100 bg-emerald-50/50 px-3 py-2 text-sm disabled:opacity-50"
            />
            <div className={reportActionsColumnClass}>
              <FeatureHelpActionButton
                helpTitle="Сохранить правку"
                disabled={!versionReady || creating || !editBefore.trim() || !editAfter.trim()}
                onClick={() => void handleAddManualEdit()}
                buttonClassName={reportActionBtnPrimary}
                helpContent={
                  <p>
                    Сохраняет пару «было / стало». На PDF — чип «Правки» с числом в углу страницы;
                    полный текст — во всплывающем окне.
                  </p>
                }
              >
                {creating ? 'Сохранение…' : 'Сохранить правку'}
              </FeatureHelpActionButton>
            </div>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          {acceptedEdits.length > 0 ? (
            <div className="space-y-2 border-t border-slate-100 pt-3">
              <p className="text-[11px] text-slate-500">
                Полный текст — «Правки» над PDF или «Открыть все» ниже. После сборки в конце файла —
                реестр «было / стало».
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
                      <span className="mt-0.5 block line-clamp-3 text-slate-600">
                        {item.content || item.quote || '—'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>

              <div className={reportActionsColumnClass}>
                <FeatureHelpActionButton
                  helpTitle="Собрать PDF с правками"
                  disabled={!versionReady || creating || applying || pollApply}
                  onClick={() => void handleApplyPdf()}
                  buttonClassName={reportActionBtnHighlight}
                  helpContent={
                    <p>
                      Создаёт новую версию с реестром правок. Исходный текст на страницах PDF не
                      переписывается — рабочая версия для согласования.
                    </p>
                  }
                >
                  {applying || pollApply ? 'Сборка PDF…' : 'Собрать PDF с правками'}
                </FeatureHelpActionButton>
                <FeatureHelpActionButton
                  helpTitle="Применить правки"
                  disabled={!versionReady || creating || applyingFinal || pollApply}
                  onClick={() => void handleApplyFinal()}
                  buttonClassName={reportActionBtnHighlight}
                  helpContent={
                    <>
                      <p>
                        Создаёт новую версию с изменённым текстом. При наличии Word правки вносятся
                        в документ и PDF пересобирается из Word.
                      </p>
                      {hasSourceDocx ? (
                        <p>При загруженном DOCX PDF и Word совпадут по тексту правок.</p>
                      ) : (
                        <p>Без исходного DOCX — PDF→Word, затем новый PDF или наложение на PDF.</p>
                      )}
                    </>
                  }
                >
                  {applyingFinal ? 'Применение…' : 'Применить правки'}
                </FeatureHelpActionButton>
                <FeatureHelpActionButton
                  helpTitle="DOCX с подсветкой правок"
                  disabled={
                    !versionReady ||
                    creating ||
                    applying ||
                    applyingFinal ||
                    exportingHighlight ||
                    pollApply ||
                    pollExportHighlight
                  }
                  onClick={() => void handleExportHighlightDocx()}
                  buttonClassName={reportActionBtnPrimary}
                  helpContent={
                    <p>
                      Word с подсветкой принятых правок — для ручной доработки без автозамены
                      текста.
                    </p>
                  }
                >
                  {exportingHighlight || pollExportHighlight
                    ? 'Экспорт DOCX…'
                    : 'DOCX с подсветкой'}
                </FeatureHelpActionButton>
              </div>

              {applyHint && (
                <div className="space-y-1">
                  <p className="break-words text-xs leading-snug text-folio-700">{applyHint}</p>
                  {applyConfidenceLevel && applyJob?.status === 'completed' && (
                    <DocumentVersionConfidenceBadge
                      level={applyConfidenceLevel}
                      summary={applyConfidenceSummary}
                      score={applyConfidenceScore}
                    />
                  )}
                  {applyEditResults.length > 0 && (
                    <ul className="max-h-28 space-y-0.5 overflow-y-auto rounded border border-slate-200 bg-slate-50/80 p-1.5 text-[10px]">
                      {applyEditResults.map((item, index) => (
                        <li
                          key={`${item.page}-${index}`}
                          className={
                            item.status === 'applied' ? 'text-emerald-700' : 'text-amber-700'
                          }
                        >
                          стр. {item.page}: {item.status === 'applied' ? '✓' : '✗'}{' '}
                          <span className="text-slate-600">
                            {item.originalText.slice(0, 48)}
                            {item.originalText.length > 48 ? '…' : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {applyJob?.status === 'completed' && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void handleDownloadPdf()}
                        className="flex cursor-pointer items-center gap-1 rounded-md bg-folio-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-folio-700"
                      >
                        <DownloadIcon className="h-3 w-3" />
                        Скачать PDF
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDownloadDocx()}
                        className="flex cursor-pointer items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-emerald-700"
                      >
                        <DownloadIcon className="h-3 w-3" />
                        Скачать DOCX
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-slate-400">
              Пока нет правок. Добавьте «было / стало» вручную или примите предложения ИИ ниже.
            </p>
          )}
        </>
      )}
    </div>
  );
}
