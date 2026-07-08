import { useRef, useState } from 'react';
import {
  useDeleteDocumentVersionMutation,
  useLazyGetSourceDocxUrlQuery,
  getVersionListStatusLabel,
} from '@folio-mind/store';
import { useAppSelector } from '../../hooks/index.js';
import { useBackgroundUpload } from '../../context/useBackgroundUpload.js';
import { getUploadStage } from '../../lib/uploads/uploadStage.js';
import { DownloadIcon } from '../ui/icons/DownloadIcon.js';
import { ConfirmDangerDialog } from '../ui/ConfirmDangerDialog.js';
import {
  docxDownloadLabel,
  docxDownloadTitle,
  versionHasDocxDownload,
} from '../../lib/documents/sourceDocx.js';
import { downloadDocumentPdf } from '../../lib/documents/documentPdf.js';
import { DeleteDocumentButton } from './DeleteDocumentButton.js';
import { DocumentVersionIntegrityBadge } from './DocumentVersionIntegrityBadge.js';
import { DocumentVersionConfidenceBadge } from './DocumentVersionConfidenceBadge.js';
import {
  isDocumentVersionSelectable,
  TITLE_VERSION_PREPARING,
} from '../../lib/documents/versionSelection.js';

function getDisplayStatus(status: string): string {
  return getVersionListStatusLabel(status);
}

const versionActionBtn =
  'inline-flex cursor-pointer items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm transition hover:border-folio-300 hover:bg-folio-50';
const versionActionBtnEmerald =
  'inline-flex cursor-pointer items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50/60 px-2.5 py-1 text-xs font-medium text-emerald-800 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50';
export type DocumentVersionItem = {
  id: string;
  version: number;
  versionLabel: 'draft' | 'in_review' | 'final' | null;
  status: string;
  size: string;
  mimeType: string;
  pageCount?: number | null;
  createdAt: string;
  integrityStatus?: string | null;
  integritySummary?: string | null;
  integrityScore?: number | null;
  confidenceLevel?: 'green' | 'yellow' | 'red' | null;
  confidenceScore?: number | null;
  confidenceSummary?: string | null;
  sourceDocxKey?: string | null;
  hasAppliedDocx?: boolean;
};
type Props = {
  documentId: string;
  versions: DocumentVersionItem[];
  selectedVersionId: string | undefined;
  onSelectVersion: (versionId: string) => void;
};
export function DocumentVersionsPanel({
  documentId,
  versions,
  selectedVersionId,
  onSelectVersion,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const token = useAppSelector((s) => s.auth.token);
  const uploadState = useAppSelector((s) => s.backgroundUpload);
  const { uploadDocumentVersion } = useBackgroundUpload();
  const uploading =
    uploadState.active && uploadState.kind === 'version' && uploadState.documentId === documentId;
  const uploadProgress = uploading ? uploadState.progress : null;
  const showUploadDone = uploading && uploadState.showDone;
  const [error, setError] = useState<string | null>(null);
  const [deleteVersion, { isLoading: deletingVersion }] = useDeleteDocumentVersionMutation();
  const [fetchDocxUrl] = useLazyGetSourceDocxUrlQuery();
  const [pendingDelete, setPendingDelete] = useState<{
    versionId: string;
    versionNumber: number;
  } | null>(null);
  const [deletingVersionId, setDeletingVersionId] = useState<string | null>(null);
  const deleteBlocked = versions.length <= 1;

  function handleNewVersion(file: File) {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Только PDF');
      return;
    }
    setError(null);
    uploadDocumentVersion(documentId, file, undefined, ({ versionId }) => {
      onSelectVersion(versionId);
    });
    if (inputRef.current) inputRef.current.value = '';
  }
  function handleSelectVersion(versionId: string) {
    const version = versions.find((v) => v.id === versionId);
    if (version && !isDocumentVersionSelectable(version)) return;
    onSelectVersion(versionId);
  }
  async function handlePdfDownload(versionId: string, versionNumber: number) {
    try {
      setError(null);
      await downloadDocumentPdf(documentId, versionId, `v${versionNumber}.pdf`, token);
    } catch {
      setError('Не удалось скачать PDF');
    }
  }
  async function handleDocxDownload(versionId: string) {
    try {
      const { url } = await fetchDocxUrl({ documentId, versionId }).unwrap();
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      setError('Не удалось получить ссылку на DOCX');
    }
  }
  async function confirmDeleteVersion() {
    if (!pendingDelete) return;
    const { versionId, versionNumber } = pendingDelete;
    try {
      setError(null);
      setDeletingVersionId(versionId);
      await deleteVersion({ documentId, versionId }).unwrap();
      setPendingDelete(null);
    } catch {
      setError(`Не удалось удалить версию ${versionNumber}`);
    } finally {
      setDeletingVersionId(null);
    }
  }
  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-900">Версии документа</h2>
        <div>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleNewVersion(file);
            }}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading
              ? uploadProgress !== null
                ? `Загрузка ${uploadProgress}%…`
                : 'Загрузка…'
              : 'Новая версия PDF'}
          </button>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {uploading && uploadProgress !== null && (
        <p className="mt-2 text-xs text-slate-500">
          {showUploadDone && uploadProgress === 100 ? '✓ Готово' : getUploadStage(uploadProgress)}
        </p>
      )}

      <ul className="mt-4 divide-y divide-slate-100">
        {versions.map((v, index) => {
          const isSelected = v.id === selectedVersionId;
          const isLatest = index === 0;
          const date = new Date(v.createdAt).toLocaleString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          });
          const sizeMb = v.size ? (Number(v.size) / (1024 * 1024)).toFixed(1) : '—';
          const selectable = isDocumentVersionSelectable(v);
          return (
            <li
              key={v.id}
              className={`py-3 text-sm ${isSelected ? 'bg-folio-50/60 -mx-2 rounded-lg px-2' : ''}`}
            >
              <button
                type="button"
                disabled={!selectable}
                title={!selectable ? TITLE_VERSION_PREPARING : undefined}
                onClick={() => handleSelectVersion(v.id)}
                className="w-full cursor-pointer text-left disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="font-medium text-slate-900">Версия {v.version}</span>
                {isLatest && (
                  <span className="ml-2 rounded-full bg-folio-100 px-2 py-0.5 text-xs font-medium text-folio-700">
                    последняя
                  </span>
                )}
                {isSelected && (
                  <span className="ml-2 text-xs font-normal text-folio-600">· в просмотре</span>
                )}
                <span className="mt-0.5 block text-xs text-slate-500">
                  {date} · {getDisplayStatus(v.status)} · {sizeMb} МБ
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
                    score={v.integrityScore}
                  />
                </div>
              )}
              {v.confidenceLevel && (
                <div className="mt-1">
                  <DocumentVersionConfidenceBadge
                    level={v.confidenceLevel}
                    summary={v.confidenceSummary}
                    score={v.confidenceScore}
                  />
                </div>
              )}
              {v.status !== 'pending_upload' && (
                <div
                  className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2"
                  role="toolbar"
                  aria-label={`Скачать версию ${v.version}`}
                >
                  {v.status === 'ready' && (
                    <button
                      type="button"
                      title="Скачать PDF этой версии"
                      onClick={() => void handlePdfDownload(v.id, v.version)}
                      className={versionActionBtn}
                    >
                      <DownloadIcon className="h-3.5 w-3.5 shrink-0" />
                      <span>PDF</span>
                    </button>
                  )}
                  {versionHasDocxDownload(v) && (
                    <button
                      type="button"
                      title={docxDownloadTitle(v)}
                      onClick={() => void handleDocxDownload(v.id)}
                      className={versionActionBtnEmerald}
                    >
                      <DownloadIcon className="h-3.5 w-3.5 shrink-0" />
                      <span>{docxDownloadLabel(v)}</span>
                    </button>
                  )}
                  <span className="ml-auto">
                    <DeleteDocumentButton
                      title={
                        deleteBlocked
                          ? 'Нельзя удалить единственную версию'
                          : `Удалить версию ${v.version}`
                      }
                      disabled={deleteBlocked}
                      busy={deletingVersionId === v.id}
                      onClick={() =>
                        setPendingDelete({ versionId: v.id, versionNumber: v.version })
                      }
                      variant="list"
                    />
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <ConfirmDangerDialog
        open={pendingDelete != null}
        title={pendingDelete ? `Удалить версию ${pendingDelete.versionNumber}?` : ''}
        description="Файл, превью, правки и пересказ этой версии будут удалены. Восстановить нельзя."
        busy={deletingVersion}
        onCancel={() => {
          if (!deletingVersion) setPendingDelete(null);
        }}
        onConfirm={() => void confirmDeleteVersion()}
      />
    </section>
  );
}
