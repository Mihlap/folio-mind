import { useEffect, useMemo, useState } from 'react';
import {
  buildExtractionDisplayRows,
  formatExtractionPlainText,
  useGetExtractionTemplatesQuery,
  useGetJobQuery,
  useRequestDocumentExtractMutation,
  type ExtractionFieldSchema,
} from '@folio-mind/store';
import {
  clearDocumentExtractDraft,
  loadDocumentExtractDraft,
  saveDocumentExtractDraft,
} from '../../lib/documents/document-extract-draft.js';
import { FeatureHelpActionButton, PanelSectionHeader } from '../ui/FeatureHelp.js';
import { reportActionBtnSoft, reportActionsColumnClass } from '../ui/FeatureHelp.styles.js';

type Props = {
  documentId: string;
  versionId: string;
  versionReady: boolean;
};

type ExtractionTemplateId = 'contract' | 'contract_sections' | 'act' | 'tz';

type ViewFormat = 'fields' | 'json';

const formatTabClass = (active: boolean) =>
  `cursor-pointer rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
    active
      ? 'bg-white text-slate-800 shadow-sm'
      : 'text-slate-500 hover:text-slate-700'
  }`;

export function DocumentExtractPanel({ documentId, versionId, versionReady }: Props) {
  const { data: templatesData } = useGetExtractionTemplatesQuery();
  const templates = useMemo(() => templatesData?.templates ?? [], [templatesData?.templates]);
  const [templateId, setTemplateId] = useState<ExtractionTemplateId>('contract');
  const [viewFormat, setViewFormat] = useState<ViewFormat>('fields');
  const [requestExtract, { isLoading: requesting }] = useRequestDocumentExtractMutation();
  const [jobId, setJobId] = useState<string | null>(null);
  const [pollJob, setPollJob] = useState(false);
  const [extracted, setExtracted] = useState<Record<string, unknown> | null>(null);
  const [templateTitle, setTemplateTitle] = useState<string | null>(null);
  const [resultTemplateId, setResultTemplateId] = useState<ExtractionTemplateId | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedHint, setCopiedHint] = useState(false);

  const { data: job } = useGetJobQuery(jobId!, {
    skip: !jobId,
    pollingInterval: pollJob ? 2000 : 0,
  });

  const activeSchema = useMemo((): ExtractionFieldSchema[] | undefined => {
    const id = resultTemplateId ?? templateId;
    const template = templates.find((t) => t.id === id);
    return template?.schema as ExtractionFieldSchema[] | undefined;
  }, [resultTemplateId, templateId, templates]);

  const displayRows = useMemo(
    () => (extracted ? buildExtractionDisplayRows(extracted, activeSchema) : []),
    [extracted, activeSchema],
  );

  useEffect(() => {
    const draft = loadDocumentExtractDraft(versionId);
    setJobId(null);
    setPollJob(false);
    setError(null);
    setCopiedHint(false);
    if (draft) {
      setExtracted(draft.extracted);
      setTemplateTitle(draft.templateTitle);
      setResultTemplateId(draft.templateId);
      if (draft.templateId) setTemplateId(draft.templateId);
      setViewFormat(draft.viewFormat);
      setCollapsed(draft.collapsed);
    } else {
      setExtracted(null);
      setTemplateTitle(null);
      setResultTemplateId(null);
      setViewFormat('fields');
      setCollapsed(false);
    }
  }, [versionId]);

  useEffect(() => {
    if (!extracted) return;
    saveDocumentExtractDraft(versionId, {
      extracted,
      templateTitle,
      templateId: resultTemplateId,
      viewFormat,
      collapsed,
    });
  }, [versionId, extracted, templateTitle, resultTemplateId, viewFormat, collapsed]);

  useEffect(() => {
    if (!job) return;
    if (job.status === 'completed') {
      setPollJob(false);
      if (job.payload?.extracted && typeof job.payload.extracted === 'object') {
        setExtracted(job.payload.extracted);
        setTemplateTitle(
          typeof job.payload.templateTitle === 'string' ? job.payload.templateTitle : null,
        );
        const tid = job.payload.templateId;
        if (
          tid === 'contract' ||
          tid === 'contract_sections' ||
          tid === 'act' ||
          tid === 'tz'
        ) {
          setResultTemplateId(tid);
        } else {
          setResultTemplateId(templateId);
        }
        setViewFormat('fields');
        setCollapsed(false);
      }
    }
    if (job.status === 'failed') {
      setPollJob(false);
      setError(
        typeof job.payload === 'object' && job.payload && 'error' in job.payload
          ? String((job.payload as { error?: string }).error ?? 'Извлечение не выполнено')
          : 'Извлечение не выполнено',
      );
    }
  }, [job, templateId]);

  const jsonText = useMemo(
    () => (extracted ? JSON.stringify(extracted, null, 2) : ''),
    [extracted],
  );
  const plainText = useMemo(
    () => formatExtractionPlainText(displayRows, templateTitle),
    [displayRows, templateTitle],
  );

  async function handleExtract() {
    setError(null);
    setExtracted(null);
    setTemplateTitle(null);
    setResultTemplateId(null);
    setCopiedHint(false);
    clearDocumentExtractDraft(versionId);
    try {
      const result = await requestExtract({
        documentId,
        versionId,
        templateId,
      }).unwrap();
      setJobId(result.jobId);
      setPollJob(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось запустить извлечение');
    }
  }

  function handleDismiss() {
    setExtracted(null);
    setTemplateTitle(null);
    setResultTemplateId(null);
    setCollapsed(false);
    setViewFormat('fields');
    clearDocumentExtractDraft(versionId);
  }

  async function copyCurrent() {
    const text = viewFormat === 'json' ? jsonText : plainText;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedHint(true);
      window.setTimeout(() => setCopiedHint(false), 2000);
    } catch {
      setError('Не удалось скопировать в буфер обмена');
    }
  }

  function downloadCurrent() {
    if (viewFormat === 'json') {
      if (!jsonText) return;
      const blob = new Blob([jsonText], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `document-data-${versionId}.json`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    if (!plainText) return;
    const blob = new Blob([plainText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `document-data-${versionId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const loading = requesting || pollJob;

  return (
    <div className="space-y-2.5 border-t border-slate-100 pt-3">
      <PanelSectionHeader title="Данные документа" />

      <label className="block space-y-1">
        <span className="text-[11px] text-slate-500">Шаблон</span>
        <select
          className="select-control w-full px-2.5 py-1.5 text-12px] leading-snug sm:text-xs"
          value={templateId}
          disabled={!versionReady || loading}
          onChange={(e) => setTemplateId(e.target.value as ExtractionTemplateId)}
        >
          {(templates.length > 0
            ? templates
            : [
                {
                  id: 'contract' as const,
                  title: 'Ключевые данные договора',
                  description: '',
                },
                {
                  id: 'contract_sections' as const,
                  title: 'Важные условия',
                  description: '',
                },
                { id: 'act' as const, title: 'Акт', description: '' },
                { id: 'tz' as const, title: 'ТЗ', description: '' },
              ]
          ).map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
        {templates.find((t) => t.id === templateId)?.description ? (
          <p className="text-[11px] leading-snug text-slate-400">
            {templates.find((t) => t.id === templateId)?.description}
          </p>
        ) : null}
      </label>

      <div className={reportActionsColumnClass}>
        <FeatureHelpActionButton
          helpTitle="Данные документа"
          disabled={!versionReady || loading}
          onClick={() => void handleExtract()}
          buttonClassName={reportActionBtnSoft}
          helpContent={
            <>
              <p>
                По умолчанию — <strong>Ключевые данные договора</strong> (стороны, цена, оплата,
                гарантия…). Для конкретики по условиям — <strong>Важные условия</strong> (факты из
                текста, не оглавление). Результат сохраняется до закрытия вкладки. Не заменяет
                юридическую проверку.
              </p>
            </>
          }
        >
          {loading ? 'Извлекаем…' : 'Извлечь данные'}
        </FeatureHelpActionButton>
      </div>

      {loading && (
        <p className="rounded-lg border border-folio-100 bg-folio-50 px-3 py-2 text-xs text-slate-600">
          Читаем документ и заполняем данные по шаблону…
        </p>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      {extracted && (
        <div className="space-y-2 rounded-lg border border-slate-100 bg-white px-3 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-medium text-slate-600">
              {templateTitle ?? 'Результат'}
              {collapsed ? ' · свёрнуто' : ''}
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCollapsed((prev) => !prev)}
                className="cursor-pointer rounded px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-100"
              >
                {collapsed ? 'Развернуть' : 'Свернуть'}
              </button>
              <button
                type="button"
                title="Удалить результат"
                aria-label="Удалить результат"
                onClick={handleDismiss}
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
          </div>

          {!collapsed && (
            <>
              <div
                className="inline-flex rounded-lg bg-slate-100 p-0.5"
                role="group"
                aria-label="Формат результата"
              >
                <button
                  type="button"
                  className={formatTabClass(viewFormat === 'fields')}
                  aria-pressed={viewFormat === 'fields'}
                  onClick={() => setViewFormat('fields')}
                >
                  Поля
                </button>
                <button
                  type="button"
                  className={formatTabClass(viewFormat === 'json')}
                  aria-pressed={viewFormat === 'json'}
                  onClick={() => setViewFormat('json')}
                >
                  JSON
                </button>
              </div>

              {viewFormat === 'fields' ? (
                displayRows.length > 0 ? (
                  <dl className="space-y-1.5">
                    {displayRows.map((row) => (
                      <div
                        key={`${row.depth}-${row.key}-${row.label}`}
                        className="grid gap-0.5"
                        style={{ paddingLeft: row.depth * 12 }}
                      >
                        <dt className="text-[10px] font-medium tracking-wide text-slate-500">
                          {row.label}
                        </dt>
                        {row.value ? (
                          <dd className="whitespace-pre-wrap text-xs text-slate-800">{row.value}</dd>
                        ) : null}
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="text-xs text-slate-500">
                    Не удалось выделить условия по шаблону. Убедитесь, что PDF с текстовым слоем
                    (или OCR завершён), и попробуйте ещё раз. Для сторон и предмета удобнее
                    «Ключевые данные договора».
                  </p>
                )
              ) : (
                <pre className="max-h-64 overflow-auto rounded-md bg-slate-50 p-2 text-[11px] leading-relaxed text-slate-800">
                  {jsonText}
                </pre>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  className={reportActionBtnSoft}
                  disabled={viewFormat === 'fields' ? displayRows.length === 0 : !jsonText}
                  onClick={() => void copyCurrent()}
                >
                  {copiedHint
                    ? 'Скопировано'
                    : viewFormat === 'json'
                      ? 'Копировать JSON'
                      : 'Копировать текст'}
                </button>
                <button
                  type="button"
                  className={reportActionBtnSoft}
                  disabled={viewFormat === 'fields' ? displayRows.length === 0 : !jsonText}
                  onClick={downloadCurrent}
                >
                  {viewFormat === 'json' ? 'Скачать JSON' : 'Скачать TXT'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
