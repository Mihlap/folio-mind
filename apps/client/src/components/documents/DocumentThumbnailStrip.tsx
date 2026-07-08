import { DocumentPageThumbnail } from './DocumentPageThumbnail.js';
import { isThumbnailEager } from './DocumentPageThumbnail.utils.js';
import type { PageReviewMarkStatus } from '../../lib/documents/pageReviewMarkers.js';

type PreviewPage = {
  page: number;
  url: string;
};
type DocumentThumbnailStripProps = {
  versionId: string | undefined;
  pages: PreviewPage[];
  viewerPage: number;
  initialThumbPages: number;
  layout: 'vertical' | 'horizontal';
  reviewMarkByPage?: Record<number, PageReviewMarkStatus>;
  onGoToPage: (page: number) => void;
};

function ThumbnailReviewBadge({ status }: { status: PageReviewMarkStatus }) {
  if (status === 'needs_fix') {
    return (
      <span
        className="pointer-events-none absolute inset-x-0 bottom-0 bg-amber-600/95 py-0.5 text-center text-[8px] font-medium leading-none text-white"
        title="Нужны правки"
      >
        правки
      </span>
    );
  }
  return (
    <span
      className="pointer-events-none absolute top-0.5 right-0.5 h-2 w-2 rounded-full bg-emerald-500 ring-1 ring-white"
      title="ОК"
      aria-hidden
    />
  );
}

export function DocumentThumbnailStrip({
  versionId,
  pages,
  viewerPage,
  initialThumbPages,
  layout,
  reviewMarkByPage = {},
  onGoToPage,
}: DocumentThumbnailStripProps) {
  if (pages.length === 0) return null;
  if (layout === 'vertical') {
    return (
      <div
        key={versionId}
        className="scrollbar-thin hidden w-14 shrink-0 flex-col gap-1.5 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 opacity-0 animate-[sidebarFadeIn_0.35s_ease-out_forwards] sm:flex sm:w-16 md:w-[4.5rem]"
        aria-label="Страницы"
      >
        {pages.map((thumb) => (
          <button
            key={thumb.page}
            type="button"
            onClick={() => onGoToPage(thumb.page)}
            className={`relative shrink-0 cursor-pointer overflow-hidden rounded border-2 transition-[border-color,box-shadow] duration-200 ${
              viewerPage === thumb.page
                ? 'border-folio-600 ring-1 ring-folio-200'
                : reviewMarkByPage[thumb.page] === 'needs_fix'
                  ? 'border-amber-400'
                  : 'border-slate-200 hover:border-folio-300'
            }`}
          >
            <DocumentPageThumbnail
              src={thumb.url}
              alt={`Стр. ${thumb.page}`}
              layout="vertical"
              eager={isThumbnailEager(thumb.page, initialThumbPages)}
              staggerMs={Math.min(thumb.page - 1, 14) * 35}
            />
            {reviewMarkByPage[thumb.page] && (
              <ThumbnailReviewBadge status={reviewMarkByPage[thumb.page]} />
            )}
          </button>
        ))}
      </div>
    );
  }
  return (
    <div
      key={versionId}
      className="scrollbar-thin flex gap-1.5 overflow-x-auto border-b border-slate-100 bg-white p-2 opacity-0 animate-[sidebarFadeIn_0.35s_ease-out_forwards] sm:hidden"
    >
      {pages.map((thumb) => (
        <button
          key={thumb.page}
          type="button"
          onClick={() => onGoToPage(thumb.page)}
          className={`relative shrink-0 cursor-pointer overflow-hidden rounded-lg border-2 transition-[border-color] duration-200 ${
            viewerPage === thumb.page
              ? 'border-folio-600'
              : reviewMarkByPage[thumb.page] === 'needs_fix'
                ? 'border-amber-400'
                : 'border-slate-200'
          }`}
        >
          <DocumentPageThumbnail
            src={thumb.url}
            alt={`Стр. ${thumb.page}`}
            layout="horizontal"
            eager={isThumbnailEager(thumb.page, initialThumbPages)}
            staggerMs={Math.min(thumb.page - 1, 14) * 35}
          />
          {reviewMarkByPage[thumb.page] && (
            <ThumbnailReviewBadge status={reviewMarkByPage[thumb.page]} />
          )}
        </button>
      ))}
    </div>
  );
}
