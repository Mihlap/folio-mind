import { Link } from 'react-router-dom';
import { shellTopHeaderClass } from '../layout/shell-chrome.js';
const STATUS_LABEL: Record<string, string> = {
  pending_upload: 'не загружен',
  processing: 'обработка',
  ready: 'готов',
  failed: 'ошибка',
};
type VersionOption = {
  id: string;
  version: number;
  status: string;
  pageCount: number | null;
};
type DocumentPageHeaderProps = {
  title: string;
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
  title,
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
      <div className="flex w-full min-w-0 items-center gap-2 sm:gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 gap-y-1">
            <Link to="/app" className="shrink-0 text-xs text-folio-600 hover:underline sm:text-sm">
              ← Документы
            </Link>
            <h1 className="min-w-0 flex-1 truncate text-base font-semibold text-slate-900 sm:text-lg">
              {title}
            </h1>
            <label className="flex min-w-0 flex-1 items-center gap-2 lg:hidden">
              <span className="sr-only">Версия</span>
              <select
                value={activeVersion?.id ?? ''}
                onChange={(e) => onSelectVersion(e.target.value)}
                className="min-w-0 flex-1 cursor-pointer rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
              >
                {versions.map((v) => (
                  <option key={v.id} value={v.id} disabled={v.status === 'pending_upload'}>
                    v{v.version}
                    {v.pageCount ? ` · ${v.pageCount} стр.` : ''}
                    {v.id === latestVersionId ? ' (нов.)' : ''}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="mt-1 text-[11px] text-slate-500 sm:text-xs">
            {activeVersion ? (
              <>
                <span className="hidden lg:inline">Просмотр: </span>v{activeVersion.version} ·{' '}
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
          {newDocumentError && <p className="mt-1 text-xs text-red-600">{newDocumentError}</p>}
        </div>
        <button
          type="button"
          disabled={newDocumentUploading || versionUploading}
          onClick={onNewDocument}
          title="Создать новый документ из PDF"
          className="shrink-0 cursor-pointer self-center rounded-lg bg-folio-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-folio-700 disabled:opacity-50 sm:text-sm"
        >
          {newDocumentUploading
            ? newDocumentUploadProgress !== null
              ? `Загрузка ${newDocumentUploadProgress}%…`
              : 'Загрузка…'
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
  if (status === 'processing' && (hasPdfUrl || previewPageCount > 0)) {
    return 'готов к просмотру';
  }
  return STATUS_LABEL[status] ?? status;
}
