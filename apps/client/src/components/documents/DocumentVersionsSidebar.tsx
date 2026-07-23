import { useState } from 'react';
import {
  roleHasCapability,
  useDeleteDocumentVersionMutation,
  useLazyGetSourceDocxUrlQuery,
  getVersionStatusLabel,
  useUpdateVersionLabelMutation,
} from '@folio-mind/store';
import { isDocumentVersionSelectable, TITLE_VERSION_PREPARING } from '../../lib/documents/versionSelection.js';
import { useDocumentWorkspaceOptional } from '../../context/useDocumentWorkspace.js';
import { useAppSelector } from '../../hooks/index.js';
import { ConfirmDangerDialog } from '../ui/ConfirmDangerDialog.js';
import { DownloadIcon } from '../ui/icons/DownloadIcon.js';
import { DeleteDocumentButton } from './DeleteDocumentButton.js';
import { DocumentVersionIntegrityBadge } from './DocumentVersionIntegrityBadge.js';
import { DocumentVersionConfidenceBadge } from './DocumentVersionConfidenceBadge.js';
import { docxBadgeLabel, docxBadgeTitle, docxDownloadLabel, docxDownloadTitle, versionHasDocxDownload } from '../../lib/documents/sourceDocx.js';
import { downloadDocumentPdf } from '../../lib/documents/documentPdf.js';
import { normalizeDocumentRole } from '../../lib/documents/document-ui-permissions.js';
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
const versionLabelBtn =
  'rounded border px-1.5 py-0.5 text-[10px] font-medium transition';
const VERSION_LABELS: Array<{ id: 'draft' | 'in_review' | 'final'; title: string }> = [
  { id: 'draft', title: 'Черновик' },
  { id: 'in_review', title: 'Соглас.' },
  { id: 'final', title: 'Финал' },
];
const VERSION_LABEL_TITLE: Record<'draft' | 'in_review' | 'final', string> = {
  draft: 'Черновик',
  in_review: 'На согласовании',
  final: 'Финал',
};
type Props = {
  variant?: 'sidebar' | 'drawer';
  onVersionAction?: () => void;
  documentRole?: string | null;
};
export function DocumentVersionsSidebar({
  variant = 'sidebar',
  onVersionAction,
  documentRole,
}: Props) {
  const ctx = useDocumentWorkspaceOptional();
  const workspace = ctx?.workspace;
  const token = useAppSelector((s) => s.auth.token);
  const [deleteVersion, { isLoading: deletingVersion }] = useDeleteDocumentVersionMutation();
  const [updateVersionLabel, { isLoading: updatingVersionLabel }] = useUpdateVersionLabelMutation();
  const [fetchDocxUrl] = useLazyGetSourceDocxUrlQuery();
  const [localError, setLocalError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{
    versionId: string;
    versionNumber: number;
  } | null>(null);
  const [deletingVersionId, setDeletingVersionId] = useState<string | null>(null);
  if (!workspace) return null;
  const {
    documentId,
    versions,
    selectedVersionId,
    onSelectVersion,
    onRequestNewVersion,
    onRequestNewDocxVersion,
    uploadingNewVersion,
    uploadError,
    uploadStatusHint,
  } = workspace;
  function handleSelectVersion(versionId: string) {
    const version = versions.find((v) => v.id === versionId);
    if (version && !isDocumentVersionSelectable(version)) return;
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
  async function handleVersionLabel(
    versionId: string,
    currentLabel: 'draft' | 'in_review' | 'final' | null,
    nextLabel: 'draft' | 'in_review' | 'final',
  ) {
    try {
      setLocalError(null);
      await updateVersionLabel({
        documentId,
        versionId,
        versionLabel: currentLabel === nextLabel ? null : nextLabel,
      }).unwrap();
    } catch {
      setLocalError('Не удалось сохранить подпись версии');
    }
  }
  async function confirmDeleteVersion() {
    if (!pendingDelete) return;
    const { versionId, versionNumber } = pendingDelete;
    try {
      setLocalError(null);
      setDeletingVersionId(versionId);
      await deleteVersion({ documentId, versionId }).unwrap();
      setPendingDelete(null);
      onVersionAction?.();
    } catch {
      setLocalError(`Не удалось удалить версию ${versionNumber}`);
    } finally {
      setDeletingVersionId(null);
    }
  }
  const deleteBlocked = versions.length <= 1;
  const isDrawer = variant === 'drawer';
  const displayError = localError ?? uploadError;
  const accessRole = normalizeDocumentRole(documentRole ?? workspace.documentRole);
  const canEdit = roleHasCapability(accessRole, 'edit');
  const canManage = roleHasCapability(accessRole, 'manage');
  const canDownload = roleHasCapability(accessRole, 'download');
  const canViewHistory = roleHasCapability(accessRole, 'view_history');
  return (
    <div
      className={isDrawer ? '' : 'flex h-full min-h-0 flex-1 flex-col overflow-hidden'}
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
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={uploadingNewVersion || !canEdit}
              onClick={onRequestNewDocxVersion}
              className="cursor-pointer rounded-md border border-emerald-200 bg-emerald-50/60 px-2 py-1 text-[11px] font-medium text-emerald-800 hover:bg-emerald-50 disabled:opacity-50"
              title={
                canEdit
                  ? 'Новая версия из DOCX (PDF создастся автоматически)'
                  : 'Недоступно для вашей роли'
              }
            >
              {uploadingNewVersion ? '+ …' : '+ DOCX'}
            </button>
            <button
              type="button"
              disabled={uploadingNewVersion || !canEdit}
              title={canEdit ? 'Загрузить новую PDF-версию' : 'Недоступно для вашей роли'}
              onClick={onRequestNewVersion}
              className="cursor-pointer rounded-md bg-folio-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-folio-700 disabled:opacity-50"
            >
              {uploadingNewVersion ? '+ …' : '+ PDF'}
            </button>
          </div>
        </div>
        {(displayError || uploadStatusHint) && (
          <p
            className={`mt-2 break-words text-[11px] leading-snug ${displayError ? 'text-red-600' : 'text-slate-500'}`}
          >
            {displayError ?? uploadStatusHint}
          </p>
        )}
      </div>

      <ul
        className={`space-y-0.5 pr-3 ${isDrawer ? 'pt-1' : 'min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-1.5 pb-2 pt-1.5 md:px-2'}`}
      >
        {versions.map((v, index) => {
          const isSelected = v.id === selectedVersionId;
          const isLatest = index === 0;
          const selectable = isDocumentVersionSelectable(v);
          return (
            <li key={v.id}>
              <div
                className={`rounded-lg px-2 py-1.5 ${isSelected ? 'bg-folio-50 ring-1 ring-folio-200' : ''}`}
              >
                <button
                  type="button"
                  disabled={!selectable || !canViewHistory}
                  title={
                    !canViewHistory
                      ? 'Для вашей роли доступна только текущая версия'
                      : !selectable
                        ? TITLE_VERSION_PREPARING
                        : undefined
                  }
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
                    {docxBadgeLabel(v) && (
                      <span
                        className="rounded bg-emerald-50 px-1 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200/80"
                        title={docxBadgeTitle(v)}
                      >
                        {docxBadgeLabel(v)}
                      </span>
                    )}
                    {isSelected && (
                      <span className="text-[10px] font-normal text-folio-600">· в просмотре</span>
                    )}
                    {v.versionLabel && (
                      <span className="rounded bg-slate-100 px-1 py-0.5 text-[10px] font-medium text-slate-700">
                        {VERSION_LABEL_TITLE[v.versionLabel]}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-tight text-slate-500">
                    {getVersionStatusLabel(v.status)}
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
                {v.confidenceLevel && (
                  <div className="mt-1">
                    <DocumentVersionConfidenceBadge
                      level={v.confidenceLevel as 'green' | 'yellow' | 'red'}
                      summary={v.confidenceSummary}
                      score={v.confidenceScore}
                      compact
                    />
                  </div>
                )}
                {v.status !== 'pending_upload' && (canEdit || canDownload || canManage) && (
                  <div
                    className="mt-1.5 flex flex-wrap items-center gap-1 border-t border-slate-100 pt-1.5"
                    role="toolbar"
                    aria-label={`Скачать v${v.version}`}
                  >
                    {canEdit && <div className="mr-1 inline-flex items-center gap-1">
                      {VERSION_LABELS.map((item) => {
                        const selected = v.versionLabel === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            disabled={updatingVersionLabel}
                            onClick={() =>
                              void handleVersionLabel(
                                v.id,
                                v.versionLabel as 'draft' | 'in_review' | 'final' | null,
                                item.id,
                              )
                            }
                            className={`${versionLabelBtn} ${
                              selected
                                ? 'border-folio-300 bg-folio-50 text-folio-700'
                                : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                            } disabled:opacity-50`}
                            title={`Отметить как «${VERSION_LABEL_TITLE[item.id]}»`}
                          >
                            {item.title}
                          </button>
                        );
                      })}
                    </div>}
                    {canDownload && v.status === 'ready' && (
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
                    {canDownload && versionHasDocxDownload(v) && (
                      <button
                        type="button"
                        title={docxDownloadTitle(v)}
                        onClick={() => void handleDocxDownload(v.id)}
                        className={versionActionBtnEmerald}
                      >
                        <DownloadIcon className="h-3 w-3 shrink-0" />
                        <span>{docxDownloadLabel(v)}</span>
                      </button>
                    )}
                    {canManage && <span className="relative z-[1] ml-auto">
                      <DeleteDocumentButton
                        title={
                          deleteBlocked
                            ? 'Нельзя удалить единственную версию'
                            : `Удалить v${v.version}`
                        }
                        disabled={deleteBlocked}
                        busy={deletingVersionId === v.id}
                        onClick={() => setPendingDelete({ versionId: v.id, versionNumber: v.version })}
                        variant="list"
                      />
                    </span>}
                  </div>
                )}
              </div>
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
    </div>
  );
}
