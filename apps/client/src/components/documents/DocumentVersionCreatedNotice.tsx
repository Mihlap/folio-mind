import type { VersionCreatedNotice } from '../../hooks/useVersionCreatedNotice.js';

type Props = {
  notice: VersionCreatedNotice;
  onDismiss: () => void;
  onCreateShareLink?: () => void;
  onCompareVersions?: () => void;
};

export function DocumentVersionCreatedNotice({
  notice,
  onDismiss,
  onCreateShareLink,
  onCompareVersions,
}: Props) {
  return (
    <div
      role="status"
      className="rounded-lg border border-folio-200 bg-folio-50/95 p-3 shadow-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold text-folio-900">
          Создана версия v{notice.versionNumber}
          {notice.previousVersionNumber != null
            ? ` (было v${notice.previousVersionNumber})`
            : ''}
        </p>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Закрыть"
          className="cursor-pointer rounded p-0.5 text-slate-400 hover:bg-white hover:text-slate-600"
        >
          ×
        </button>
      </div>
      <p className="mt-1 text-[11px] leading-snug text-folio-800">
        Замечания и ссылки остаются у прежней версии — при необходимости обновите ссылку или
        сравните изменения.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {onCreateShareLink && (
          <button
            type="button"
            onClick={onCreateShareLink}
            className="cursor-pointer rounded-md border border-folio-300 bg-white px-2.5 py-1 text-[11px] font-medium text-folio-800 hover:bg-folio-100"
          >
            Ссылка на v{notice.versionNumber}
          </button>
        )}
        {onCompareVersions && notice.previousVersionId && (
          <button
            type="button"
            onClick={onCompareVersions}
            className="cursor-pointer rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
          >
            Сравнить версии
          </button>
        )}
      </div>
    </div>
  );
}
