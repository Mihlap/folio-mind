import { useEffect, useState } from 'react';
import {
  PRESENTATION_SLIDE_HEIGHT_PT,
  PRESENTATION_SLIDE_WIDTH_PT,
  resolveSlideGeometry,
  splitSlideBullets,
  type PresentationSlideLayout,
} from '@folio-mind/pdf-contracts';
import { fetchMediaAssetDataUrl, type MediaAssetItem } from '@folio-mind/store';

export type SlideLike = {
  id?: string;
  title?: string | null;
  subtitle?: string | null;
  body?: string | null;
  notes?: string | null;
  layoutVariant?: PresentationSlideLayout;
  background?: string | null;
  sourcePage?: number | null;
  mediaAssetId?: string | null;
};

export function resolveSlideImage(
  slide: SlideLike,
  mediaAssets: MediaAssetItem[],
): { kind: 'page'; page: number } | { kind: 'asset'; asset: MediaAssetItem } | null {
  if (slide.sourcePage != null) return { kind: 'page', page: slide.sourcePage };
  if (slide.mediaAssetId) {
    const asset = mediaAssets.find((item) => item.id === slide.mediaAssetId);
    if (asset) return { kind: 'asset', asset };
  }
  return null;
}

export function SlideImage({
  slide,
  mediaAssets,
  pageUrl,
  token,
  className,
}: {
  slide: SlideLike;
  mediaAssets: MediaAssetItem[];
  pageUrl: string | null;
  token: string | null;
  className?: string;
}) {
  const source = resolveSlideImage(slide, mediaAssets);
  const [src, setSrc] = useState<string | null>(null);

  const assetId = source?.kind === 'asset' ? source.asset.id : null;
  const directUrl = source?.kind === 'asset' ? (source.asset.thumbUrl ?? source.asset.previewUrl) : null;

  useEffect(() => {
    let cancelled = false;
    if (source?.kind === 'page') {
      setSrc(pageUrl);
      return () => {
        cancelled = true;
      };
    }
    if (!source || source.kind !== 'asset') {
      setSrc(null);
      return () => {
        cancelled = true;
      };
    }
    if (directUrl) {
      setSrc(directUrl);
      return () => {
        cancelled = true;
      };
    }
    setSrc(null);
    void (async () => {
      try {
        const dataUrl = await fetchMediaAssetDataUrl(source.asset.id, token);
        if (!cancelled) setSrc(dataUrl);
      } catch {
        if (!cancelled) setSrc(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [assetId, directUrl, pageUrl, source, token]);

  if (!src) return null;
  return <img src={src} alt="" className={className} />;
}

function percent(value: number, total: number) {
  return `${(value / total) * 100}%`;
}

export function SlideCanvas({
  slide,
  mediaAssets,
  pageUrl,
  token,
  className = '',
  interactive = false,
}: {
  slide: SlideLike;
  mediaAssets: MediaAssetItem[];
  pageUrl: string | null;
  token: string | null;
  className?: string;
  interactive?: boolean;
}) {
  const geometry = resolveSlideGeometry(slide.layoutVariant ?? 'image_top');
  const bullets = splitSlideBullets(slide.body);
  const hasImageBox = geometry.imageRect != null;

  return (
    <div
      className={`relative w-full overflow-hidden ${className}`}
      style={{ aspectRatio: '16 / 9', background: slide.background ?? '#f8fafc' }}
    >
      {hasImageBox && geometry.imageRect ? (
        <div
          className="absolute flex items-center justify-center"
          style={{
            left: percent(geometry.imageRect.x, PRESENTATION_SLIDE_WIDTH_PT),
            top: percent(geometry.imageRect.y, PRESENTATION_SLIDE_HEIGHT_PT),
            width: percent(geometry.imageRect.width, PRESENTATION_SLIDE_WIDTH_PT),
            height: percent(geometry.imageRect.height, PRESENTATION_SLIDE_HEIGHT_PT),
          }}
        >
          <SlideImage
            slide={slide}
            mediaAssets={mediaAssets}
            pageUrl={pageUrl}
            token={token}
            className="h-full w-full object-contain"
          />
        </div>
      ) : null}

      <div
        className="absolute flex flex-col"
        style={{
          left: percent(geometry.textRect.x, PRESENTATION_SLIDE_WIDTH_PT),
          top: percent(geometry.textRect.y, PRESENTATION_SLIDE_HEIGHT_PT),
          width: percent(geometry.textRect.width, PRESENTATION_SLIDE_WIDTH_PT),
          height: percent(geometry.textRect.height, PRESENTATION_SLIDE_HEIGHT_PT),
        }}
      >
        {slide.title ? (
          <span className="block truncate text-[13px] font-semibold leading-tight text-slate-800">
            {slide.title}
          </span>
        ) : null}
        {slide.subtitle ? (
          <span className="mt-0.5 block truncate text-[11px] leading-tight text-slate-500">
            {slide.subtitle}
          </span>
        ) : null}
        {bullets.length > 0 ? (
          <ul className="mt-1 space-y-0.5 overflow-hidden">
            {bullets.slice(0, interactive ? 8 : 4).map((bullet, index) => (
              <li
                key={`${index}-${bullet.slice(0, 8)}`}
                className="truncate text-[11px] leading-tight text-slate-600"
              >
                • {bullet}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
