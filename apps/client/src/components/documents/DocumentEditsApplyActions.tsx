import { useContext } from 'react';
import { FeatureHelpActionButton } from '../ui/FeatureHelp.js';
import {
  reportActionBtnHighlight,
  reportActionBtnPrimary,
  reportActionsColumnClass,
} from '../ui/FeatureHelp.styles.js';
import { DownloadIcon } from '../ui/icons/DownloadIcon.js';
import { DocumentVersionConfidenceBadge } from './DocumentVersionConfidenceBadge.js';
import { DocumentAnnotationsContext } from './DocumentAnnotationsPanel.js';

export function DocumentEditsApplyActions() {
  const c = useContext(DocumentAnnotationsContext);
  if (!c) return null;

  const {
    versionReady,
    creating,
    applying,
    applyingFinal,
    exportingHighlight,
    pollApply,
    pollExportHighlight,
    acceptedEdits,
    applyHint,
    applyJob,
    applyEditResults,
    applyFailedEdits,
    applyFailureRetryable,
    applyConfidenceLevel,
    applyConfidenceScore,
    applyConfidenceSummary,
    hasSourceDocx,
    handleExportHighlightDocx,
    handleApplyFinal,
    handleDownloadPdf,
    handleDownloadDocx,
    handleApplyPdf,
  } = c;

  if (acceptedEdits.length === 0) return null;

  return (
    <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
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
                Создаёт новую версию с изменённым текстом. При наличии Word правки вносятся в
                документ и PDF пересобирается из Word.
              </p>
              {hasSourceDocx ? (
                <p>При загруженном DOCX PDF и Word совпадут по тексту правок.</p>
              ) : (
                <p>Без исходного DOCX — PDF→Word, затем новый PDF или наложение на PDF.</p>
              )}
            </>
          }
        >
          {applyingFinal || pollApply ? 'Сборка версии…' : 'Применить правки'}
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
            hasSourceDocx ? (
              <>
                <p>
                  Word-файл с подсветкой: «Было» — жёлтым, «Стало» — зелёным рядом. Текст в
                  документе не заменяется, удобно для ручной правки.
                </p>
                <p>Исходный DOCX прикреплён — совпадение с полем «Было» обычно надёжное.</p>
              </>
            ) : (
              <>
                <p>
                  Word-файл с подсветкой принятых правок — для ручной доработки без автозамены
                  текста.
                </p>
                <p>
                  Без исходного DOCX система конвертирует PDF→Word автоматически; текст в Word часто
                  не совпадает с выделением в PDF, и подсветка может не сработать.
                </p>
                <p>
                  Если DOCX недоступен, используйте «Собрать PDF с правками» (красные рамки на
                  исходном PDF) или «Применить правки» (наложение на PDF).
                </p>
              </>
            )
          }
        >
          {exportingHighlight || pollExportHighlight ? 'Экспорт DOCX…' : 'DOCX с подсветкой'}
        </FeatureHelpActionButton>
      </div>

      {applyHint && (
        <div className="space-y-1">
          <p className="break-words text-xs leading-snug text-folio-700">{applyHint}</p>
          {applyJob?.status === 'failed' && applyFailedEdits.length > 0 && (
            <ul className="max-h-32 space-y-0.5 overflow-y-auto rounded border border-red-100 bg-red-50/60 p-1.5 text-[10px]">
              {applyFailedEdits.map((item, index) => (
                <li key={index} className="text-red-700">
                  {typeof item.page === 'number' ? `стр. ${item.page}: ` : ''}
                  <span className="text-slate-600">
                    «{(item.originalText ?? '').slice(0, 56)}
                    {(item.originalText ?? '').length > 56 ? '…' : ''}»
                  </span>
                </li>
              ))}
            </ul>
          )}
          {applyJob?.status === 'failed' && applyFailureRetryable && (
            <button
              type="button"
              onClick={() => void handleApplyFinal()}
              className="cursor-pointer rounded-md bg-folio-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-folio-700"
            >
              Повторить
            </button>
          )}
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
                  className={item.status === 'applied' ? 'text-emerald-700' : 'text-amber-700'}
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
  );
}
