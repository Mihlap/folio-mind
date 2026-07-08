import {
  HINT_PAGE_REVIEW_AUTHOR,
  LABEL_PAGE_REVIEW_NEEDS_FIX,
  LABEL_PAGE_REVIEW_OK,
  LABEL_PAGE_REVIEW_SECTION,
} from '@folio-mind/store';
import {
  useListPageReviewMarksQuery,
  useSetPageReviewMarkMutation,
  type PageReviewMarkStatus,
} from '@folio-mind/store';
import { FeatureHelpButton } from '../ui/FeatureHelp.js';

type Props = {
  documentId: string;
  versionId: string;
  viewerPage: number;
  versionReady: boolean;
};

export function DocumentPageReviewBar({ documentId, versionId, viewerPage, versionReady }: Props) {
  const { data } = useListPageReviewMarksQuery(
    { documentId, versionId },
    { skip: !versionId },
  );
  const [setMark, { isLoading }] = useSetPageReviewMarkMutation();

  const current = data?.items.find((m) => m.page === viewerPage)?.status ?? null;
  const needsFixCount = data?.items.filter((m) => m.status === 'needs_fix').length ?? 0;

  async function apply(status: PageReviewMarkStatus | null) {
    if (!versionReady) return;
    await setMark({ documentId, versionId, page: viewerPage, status }).unwrap();
  }

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-slate-800">{LABEL_PAGE_REVIEW_SECTION}</p>
          <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{HINT_PAGE_REVIEW_AUTHOR}</p>
        </div>
        <FeatureHelpButton title={LABEL_PAGE_REVIEW_SECTION}>
          <p>
            «Нужны правки» — заказчик увидит жёлтый баннер на этой странице по гостевой ссылке.
          </p>
          <p>«ОК» — только для вашей команды: отметка на миниатюрах и в просмотрщике.</p>
        </FeatureHelpButton>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-slate-700">Стр. {viewerPage}:</span>
        <button
          type="button"
          disabled={!versionReady || isLoading}
          onClick={() => void apply(current === 'ok' ? null : 'ok')}
          className={[
            'cursor-pointer rounded border px-2 py-0.5',
            current === 'ok'
              ? 'border-emerald-400 bg-emerald-50 text-emerald-800'
              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
          ].join(' ')}
        >
          {LABEL_PAGE_REVIEW_OK}
        </button>
        <button
          type="button"
          disabled={!versionReady || isLoading}
          onClick={() => void apply(current === 'needs_fix' ? null : 'needs_fix')}
          className={[
            'cursor-pointer rounded border px-2 py-0.5',
            current === 'needs_fix'
              ? 'border-amber-400 bg-amber-50 text-amber-900'
              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
          ].join(' ')}
        >
          {LABEL_PAGE_REVIEW_NEEDS_FIX}
        </button>
      </div>

      {needsFixCount > 0 && (
        <p className="text-[11px] text-amber-800">
          Заказчик увидит «Нужны правки» на {needsFixCount} стр. по ссылке.
        </p>
      )}
    </div>
  );
}
