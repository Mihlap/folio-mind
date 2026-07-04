import {
  useListPageReviewMarksQuery,
  useSetPageReviewMarkMutation,
  type PageReviewMarkStatus,
} from '@folio-mind/store';

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

  async function apply(status: PageReviewMarkStatus | null) {
    if (!versionReady) return;
    await setMark({ documentId, versionId, page: viewerPage, status }).unwrap();
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs">
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
        ОК
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
        Нужны правки
      </button>
    </div>
  );
}
