import type { VersionWorkflowContext } from '../../lib/documents/version-workflow.js';

type Props = {
  context: VersionWorkflowContext;
  onOpenShare?: () => void;
  onSwitchToLinkedVersion?: (versionId: string) => void;
  onOpenGuestComments?: () => void;
};

export function DocumentVersionContextBanner({
  context,
  onOpenShare,
  onSwitchToLinkedVersion,
  onOpenGuestComments,
}: Props) {
  const metaParts = [
    `v${context.versionNumber}`,
    context.pageCount != null ? `${context.pageCount} стр.` : null,
    context.sizeMb,
    context.versionStatusLabel,
  ].filter(Boolean);

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div>
        <p className="text-xs font-semibold text-slate-800">Сейчас открыта {metaParts.join(' · ')}</p>
        <p className="mt-0.5 text-[11px] text-slate-500">
          Документ: {context.documentReviewStatusLabel}
        </p>
      </div>

      {!context.versionReady && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] leading-snug text-amber-900">
          Версия ещё обрабатывается — часть инструментов временно недоступна.
        </p>
      )}

      {context.shareLinkMismatch && (
        <div className="rounded-md border border-amber-200 bg-amber-50/90 px-2.5 py-2 text-[11px] leading-snug text-amber-950">
          <p className="font-medium">
            Активная ссылка ведёт на v{context.shareLinkMismatch.activeLinkVersionNumber}, а не на
            текущую v{context.versionNumber}.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {onSwitchToLinkedVersion && (
              <button
                type="button"
                onClick={() =>
                  onSwitchToLinkedVersion(context.shareLinkMismatch!.activeLinkVersionId)
                }
                className="cursor-pointer rounded-md border border-amber-300 bg-white px-2 py-1 text-[11px] font-medium text-amber-900 hover:bg-amber-100/60"
              >
                Перейти на v{context.shareLinkMismatch.activeLinkVersionNumber}
              </button>
            )}
            {onOpenShare && (
              <button
                type="button"
                onClick={onOpenShare}
                className="cursor-pointer rounded-md border border-folio-300 bg-folio-50 px-2 py-1 text-[11px] font-medium text-folio-800 hover:bg-folio-100"
              >
                Создать ссылку на v{context.versionNumber}
              </button>
            )}
          </div>
        </div>
      )}

      {(context.openGuestCommentsCount > 0 || context.needsFixMarksCount > 0) && (
        <div className="flex flex-wrap gap-2 text-[11px]">
          {context.openGuestCommentsCount > 0 && onOpenGuestComments && (
            <button
              type="button"
              onClick={onOpenGuestComments}
              className="cursor-pointer rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-medium text-slate-700 hover:bg-slate-100"
            >
              {context.openGuestCommentsCount} открытых замечаний
            </button>
          )}
          {context.needsFixMarksCount > 0 && (
            <span className="rounded-md border border-amber-200 bg-amber-50/80 px-2 py-1 text-amber-900">
              {context.needsFixMarksCount} стр. с меткой «нужны правки»
            </span>
          )}
        </div>
      )}

      {context.hasShareLinkOnCurrentVersion &&
        !context.shareLinkMismatch &&
        context.openGuestCommentsCount === 0 && (
          <p className="text-[11px] text-emerald-700">
            На этой версии есть активная ссылка для заказчика.
          </p>
        )}
    </div>
  );
}
