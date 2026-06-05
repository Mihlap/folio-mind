import { useState } from 'react';
import { useDeleteDocumentVersionMutation, useLazyGetDownloadUrlQuery } from '@folio-mind/store';
import { useDocumentWorkspaceOptional } from '../../context/document-workspace-context.js';
import { DownloadIcon } from '../ui/icons/DownloadIcon.js';
import { DeleteDocumentButton } from './DeleteDocumentButton.js';
import { DocumentVersionIntegrityBadge } from './DocumentVersionIntegrityBadge.js';

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

type Props = {
  variant?: 'sidebar' | 'drawer';
  onVersionAction?: () => void;
};

export function DocumentVersionsSidebar({ variant = 'sidebar', onVersionAction }: Props) {
  const ctx = useDocumentWorkspaceOptional();
  const workspace = ctx?.workspace;
  const [deleteVersion, { isLoading: deletingVersion }] = useDeleteDocumentVersionMutation();
  const [fetchDownloadUrl] = useLazyGetDownloadUrlQuery();
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

  async function handleDownload(versionId: string) {
    try {
      setLocalError(null);
      const { url } = await fetchDownloadUrl({ documentId, versionId }).unwrap();
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      setLocalError('Не удалось скачать');
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
      className={
        isDrawer
          ? 'flex flex-col'
          : 'flex h-full min-h-0 flex-1 flex-col overflow-hidden'
      }
    >
      <div
        className={`shrink-0 bg-white ${
          isDrawer
            ? 'mb-3'
            : 'border-b border-slate-100 px-2 py-2.5 md:px-2.5'
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
          <p
            className={`mt-2 text-[11px] ${displayError ? 'text-red-600' : 'text-slate-500'}`}
          >
            {displayError ?? uploadStatusHint}
          </p>
        )}
      </div>

      <ul
        className={`min-h-0 space-y-0.5 overflow-y-auto overscroll-y-contain ${
          isDrawer ? 'max-h-[50vh] pt-1' : 'flex-1 px-1.5 pb-2 pt-1.5 md:px-2'
        }`}
      >
        {versions.map((v, index) => {
          const isSelected = v.id === selectedVersionId;
          const isLatest = index === 0;
          return (
            <li key={v.id}>
              <div
                className={`group flex items-start gap-1 rounded-lg px-2 py-1.5 transition ${
                  isSelected ? 'bg-folio-50 ring-1 ring-folio-200' : 'hover:bg-slate-50'
                }`}
              >
                <button
                  type="button"
                  disabled={v.status === 'pending_upload'}
                  onClick={() => {
                    onSelectVersion(v.id);
                    onVersionAction?.();
                  }}
                  className="min-w-0 flex-1 cursor-pointer text-left disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="flex items-center gap-1.5 text-sm font-medium text-slate-900">
                    v{v.version}
                    {isLatest && (
                      <span className="rounded bg-folio-100 px-1 py-0.5 text-[10px] font-medium text-folio-700">
                        нов.
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-tight text-slate-500">
                    {STATUS_SHORT[v.status] ?? v.status}
                    {formatVersionMeta(v.size, v.pageCount) !== '—'
                      ? ` · ${formatVersionMeta(v.size, v.pageCount)}`
                      : ''}
                  </span>
                  {(v.status === 'ready' || v.integrityStatus) && (
                    <span className="mt-1 block">
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
                    </span>
                  )}
                </button>
                {v.status !== 'pending_upload' && (
                  <div className="flex shrink-0 flex-col items-end gap-0.5">
                    <button
                      type="button"
                      title="Скачать PDF этой версии"
                      onClick={() => void handleDownload(v.id)}
                      className="flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-folio-700 hover:bg-folio-50"
                    >
                      <DownloadIcon className="h-3 w-3 shrink-0" />
                      <span>Скачать</span>
                    </button>
                    <DeleteDocumentButton
                      title={`Удалить v${v.version}`}
                      disabled={deletingVersion || versions.length <= 1}
                      onClick={() => void handleDelete(v.id, v.version)}
                      variant="list"
                    />
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
