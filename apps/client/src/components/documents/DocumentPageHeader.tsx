import { Link } from 'react-router-dom';
import type { DocumentReviewStatus } from '@folio-mind/store';
import { DocumentReviewStatusBadge } from './DocumentReviewStatusControl.js';
import { DocumentProjectSelect } from './DocumentProjectSelect.js';
import { shellTopHeaderClass } from '../layout/shell-chrome.js';
import { isDocumentVersionSelectable } from '../../lib/documents/versionSelection.js';

const STATUS_LABEL: Record<string, string> = {
  pending_upload: 'не загружен',
  processing: 'сборка',
  ready: 'готов',
  failed: 'ошибка',
};

type VersionOption = {
  id: string;
  version: number;
  versionLabel: 'draft' | 'in_review' | 'final' | null;
  status: string;
  pageCount: number | null;
  size?: string | null;
};
const VERSION_LABEL_TITLE: Record<'draft' | 'in_review' | 'final', string> = {
  draft: 'Черновик',
  in_review: 'На согласовании',
  final: 'Финал',
};

type DocumentPageHeaderProps = {
  documentId: string;
  title: string;
  reviewStatus?: DocumentReviewStatus;
  projectId?: string | null;
  projectName?: string | null;
  versions: VersionOption[];
  activeVersion: VersionOption | undefined;
  latestVersionId: string | undefined;
  statusLabel: string;
  sizeLabel: string | null;
  newDocumentUploading: boolean;
  newDocumentUploadProgress: number | null;
  versionUploading: boolean;
  newDocumentError: string | null;
  onSelectVersion: (versionId: string) => void;
  onNewDocument: () => void;
};

export function DocumentPageHeader({
  documentId,
  title,
  reviewStatus = 'draft',
  projectId = null,
  projectName = null,
  versions,
  activeVersion,
  latestVersionId,
  statusLabel,
  sizeLabel,
  newDocumentUploading,
  newDocumentUploadProgress,
  versionUploading,
  newDocumentError,
  onSelectVersion,
  onNewDocument,
}: DocumentPageHeaderProps) {
  return (
    <header className={`${shellTopHeaderClass} shrink-0 px-3 sm:px-4`}>
      <div className="flex w-full min-w-0 items-start gap-2 sm:items-center sm:gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <Link to="/app" className="shrink-0 text-xs text-folio-600 hover:underline sm:text-sm">
              ← Документы
            </Link>
            <h1 className="min-w-0 flex-1 truncate text-base font-semibold text-slate-900 sm:text-lg">
              {title}
            </h1>
            <DocumentReviewStatusBadge status={reviewStatus} className="hidden sm:inline-flex" />
          </div>
          <label className="mt-1.5 flex w-full min-w-0 items-center gap-2 md:hidden">
            <span className="sr-only">Версия</span>
            <select
              value={activeVersion?.id ?? ''}
              onChange={(e) => onSelectVersion(e.target.value)}
              className="min-w-0 w-full cursor-pointer rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
            >
              {versions.map((v) => (
                <option
                  key={v.id}
                  value={v.id}
                  disabled={!isDocumentVersionSelectable(v)}
                >
                  v{v.version}
                  {v.versionLabel ? ` · ${VERSION_LABEL_TITLE[v.versionLabel]}` : ''}
                  {v.pageCount ? ` · ${v.pageCount} стр.` : ''}
                  {v.id === latestVersionId ? ' (нов.)' : ''}
                </option>
              ))}
            </select>
          </label>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 truncate text-[11px] text-slate-500 sm:text-xs">
            <DocumentProjectSelect
              documentId={documentId}
              projectId={projectId}
              projectName={projectName}
              compact
            />
            {activeVersion ? (
              <>
                <span className="hidden md:inline">Просмотр: </span>v{activeVersion.version} ·{' '}
                {activeVersion.versionLabel
                  ? `${VERSION_LABEL_TITLE[activeVersion.versionLabel]} · `
                  : ''}
                {statusLabel}
                {sizeLabel ? ` · ${sizeLabel}` : ''}
                {activeVersion.pageCount ? ` · ${activeVersion.pageCount} стр.` : ''}
              </>
            ) : (
              'Нет версии'
            )}
          </p>
          {activeVersion?.status === 'pending_upload' && (
            <p className="mt-1 text-xs text-amber-700">
              Файл не загружен — выберите другую версию.
            </p>
          )}
          {newDocumentError && (
            <p className="mt-1 break-words text-xs text-red-600">{newDocumentError}</p>
          )}
        </div>
        <button
          type="button"
          disabled={newDocumentUploading || versionUploading}
          onClick={onNewDocument}
          title="Создать новый документ из PDF"
          className="max-w-[38vw] shrink-0 cursor-pointer self-center truncate rounded-lg bg-folio-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-folio-700 disabled:opacity-50 sm:max-w-none sm:px-3 sm:text-sm"
        >
          {newDocumentUploading
            ? newDocumentUploadProgress !== null
              ? `${newDocumentUploadProgress}%…`
              : '…'
            : '+ Документ'}
        </button>
      </div>
    </header>
  );
}

export function formatVersionStatusLabel(
  status: string | undefined,
  hasPdfUrl: boolean,
  previewPageCount: number,
): string {
  if (!status) return '';
  if (status === 'processing') {
    if (hasPdfUrl || previewPageCount > 0) return 'открывается';
    return 'сборка PDF';
  }
  return STATUS_LABEL[status] ?? status;
}
