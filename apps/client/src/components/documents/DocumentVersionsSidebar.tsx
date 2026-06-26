import { useState } from 'react';
import { useDeleteDocumentVersionMutation, useLazyGetSourceDocxUrlQuery } from '@folio-mind/store';
import { useDocumentWorkspaceOptional } from '../../context/document-workspace-context.js';
import { useAppSelector } from '../../hooks/index.js';
import { DownloadIcon } from '../ui/icons/DownloadIcon.js';
import { DeleteDocumentButton } from './DeleteDocumentButton.js';
import { DocumentVersionIntegrityBadge } from './DocumentVersionIntegrityBadge.js';
import { hasUserSourceDocx } from '../../lib/documents/sourceDocx.js';
import { downloadDocumentPdf } from '../../lib/documents/documentPdf.js';
const STATUS_SHORT: Record<string, string> = {
  pending_upload: 'не загружен',
  processing: 'обработка',
  ready: 'готов',
  failed: 'ошибка',
};
function formatVersionMeta(size: string, pageCount?: number | null) {
  const parts: string[] = [];
  if (pageCount && pageCount > 0) parts.push(`${pageCount} стр.`);
  if (size && Number(size) > 0) {
    parts.push(`${(Number(size) / (1024 * 1024)).toFixed(1)} МБ`);
  }
  return parts.join(' · ') || '—';
}
const versionActionBtn =
  'inline-flex cursor-pointer items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-700 shadow-sm transition hover:border-folio-300 hover:bg-folio-50';
const versionActionBtnEmerald =
  'inline-flex cursor-pointer items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50/60 px-2 py-1 text-[10px] font-medium text-emerald-800 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50';
type Props = {
  variant?: 'sidebar' | 'drawer';
  onVersionAction?: () => void;
};
export function DocumentVersionsSidebar({ variant = 'sidebar', onVersionAction }: Props) {
  const ctx = useDocumentWorkspaceOptional();
  const workspace = ctx?.workspace;
  const token = useAppSelector((s) => s.auth.token);
  const [deleteVersion, { isLoading: deletingVersion }] = useDeleteDocumentVersionMutation();
  const [fetchDocxUrl] = useLazyGetSourceDocxUrlQuery();
  const [localError, setLocalError] = useState<string | null>(null);
  if (!workspace) return null;
  const {
    documentId,
    versions,
    selectedVersionId,
    onSelectVersion,
    onRequestNewVersion,
    uploadingNewVersion,
    uploadError,
    uploadStatusHint,
  } = workspace;
  function handleSelectVersion(versionId: string) {
    onSelectVersion(versionId);
    onVersionAction?.();
  }
  async function handlePdfDownload(versionId: string, versionNumber: number) {
    try {
      setLocalError(null);
      await downloadDocumentPdf(documentId, versionId, `v${versionNumber}.pdf`, token);
    } catch {
      setLocalError('Не удалось скачать PDF');
    }
  }
  async function handleDocxDownload(versionId: string) {
    try {
      setLocalError(null);
      const { url } = await fetchDocxUrl({ documentId, versionId }).unwrap();
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      setLocalError('Не удалось скачать DOCX');
    }
  }
  async function handleDelete(versionId: string, versionNumber: number) {
    const ok = window.confirm(
      `Удалить версию ${versionNumber}?\n\nФайл, превью и пересказ этой версии будут удалены.`,
    );
    if (!ok) return;
    try {
      setLocalError(null);
      await deleteVersion({ documentId, versionId }).unwrap();
      onVersionAction?.();
    } catch {
      setLocalError('Не удалось удалить версию');
    }
  }
  const isDrawer = variant === 'drawer';
  const displayError = localError ?? uploadError;
  return (
    <div
      className={isDrawer ? 'flex flex-col' : 'flex h-full min-h-0 flex-1 flex-col overflow-hidden'}
    >
      <div
        className={`shrink-0 bg-white ${
          isDrawer ? 'mb-3' : 'border-b border-slate-100 px-2 py-2.5 md:px-2.5'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Версии
          </span>
          <button
            type="button"
            disabled={uploadingNewVersion}
            onClick={onRequestNewVersion}
            className="cursor-pointer rounded-md bg-folio-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-folio-700 disabled:opacity-50"
          >
            {uploadingNewVersion ? '+ …' : '+ PDF'}
          </button>
        </div>
        {(displayError || uploadStatusHint) && (
          <p className={`mt-2 text-[11px] ${displayError ? 'text-red-600' : 'text-slate-500'}`}>
            {displayError ?? uploadStatusHint}
          </p>
        )}
      </div>

      <ul
        className={`min-h-0 space-y-0.5 overflow-y-auto overscroll-y-contain ${isDrawer ? 'max-h-[50vh] pt-1' : 'flex-1 px-1.5 pb-2 pt-1.5 md:px-2'}`}
      >
        {versions.map((v, index) => {
          const isSelected = v.id === selectedVersionId;
          const isLatest = index === 0;
          return (
            <li key={v.id}>
              <div
                className={`rounded-lg px-2 py-1.5 ${isSelected ? 'bg-folio-50 ring-1 ring-folio-200' : ''}`}
              >
                <button
                  type="button"
                  disabled={v.status === 'pending_upload'}
                  onClick={() => handleSelectVersion(v.id)}
                  className="w-full cursor-pointer rounded-md text-left disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-slate-900">
                    v{v.version}
                    {isLatest && (
                      <span className="rounded bg-folio-100 px-1 py-0.5 text-[10px] font-medium text-folio-700">
                        нов.
                      </span>
                    )}
                    {hasUserSourceDocx(v.sourceDocxKey) && (
                      <span
                        className="rounded bg-emerald-50 px-1 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200/80"
                        title="Исходный DOCX прикреплён"
                      >
                        DOCX
                      </span>
                    )}
                    {isSelected && (
                      <span className="text-[10px] font-normal text-folio-600">· в просмотре</span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-tight text-slate-500">
                    {STATUS_SHORT[v.status] ?? v.status}
                    {formatVersionMeta(v.size, v.pageCount) !== '—'
                      ? ` · ${formatVersionMeta(v.size, v.pageCount)}`
                      : ''}
                  </span>
                </button>
                {(v.status === 'ready' || v.integrityStatus) && (
                  <div className="mt-1">
                    <DocumentVersionIntegrityBadge
                      status={
                        v.status === 'processing' && !v.integrityStatus
                          ? 'pending'
                          : (v.integrityStatus as
                              | 'intact'
                              | 'modified'
                              | 'cannot_verify'
                              | 'failed'
                              | null)
                      }
                      summary={v.integritySummary}
                      compact
                    />
                  </div>
                )}
                {v.status !== 'pending_upload' && (
                  <div
                    className="mt-1.5 flex flex-wrap items-center gap-1 border-t border-slate-100 pt-1.5"
                    role="toolbar"
                    aria-label={`Скачать v${v.version}`}
                  >
                    {v.status === 'ready' && (
                      <button
                        type="button"
                        title="Скачать PDF этой версии"
                        onClick={() => void handlePdfDownload(v.id, v.version)}
                        className={versionActionBtn}
                      >
                        <DownloadIcon className="h-3 w-3 shrink-0" />
                        <span>PDF</span>
                      </button>
                    )}
                    {hasUserSourceDocx(v.sourceDocxKey) && (
                      <button
                        type="button"
                        title="Скачать исходный DOCX"
                        onClick={() => void handleDocxDownload(v.id)}
                        className={versionActionBtnEmerald}
                      >
                        <DownloadIcon className="h-3 w-3 shrink-0" />
                        <span>DOCX</span>
                      </button>
                    )}
                    <span className="ml-auto">
                      <DeleteDocumentButton
                        title={`Удалить v${v.version}`}
                        disabled={deletingVersion || versions.length <= 1}
                        onClick={() => void handleDelete(v.id, v.version)}
                        variant="list"
                      />
                    </span>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
