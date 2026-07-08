import { useEffect, useState } from 'react';
import { fetchMediaAssetDataUrl, type MediaAssetItem } from '@folio-mind/store';

type Props = {
  asset: MediaAssetItem;
  token: string | null;
  className?: string;
};

export function MediaAssetThumbnail({ asset, token, className }: Props) {
  const [src, setSrc] = useState<string | null>(asset.thumbUrl ?? asset.previewUrl);
  const [loading, setLoading] = useState(!(asset.thumbUrl ?? asset.previewUrl));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSrc(asset.thumbUrl ?? asset.previewUrl);
    setFailed(false);
    setLoading(!(asset.thumbUrl ?? asset.previewUrl));

    if (asset.thumbUrl ?? asset.previewUrl) return;

    void (async () => {
      try {
        const dataUrl = await fetchMediaAssetDataUrl(asset.id, token);
        if (!cancelled) setSrc(dataUrl);
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [asset.id, asset.previewUrl, asset.thumbUrl, token]);

  async function handleImageError() {
    if (failed || !asset.previewUrl) return;
    setFailed(true);
    setLoading(true);
    try {
      const dataUrl = await fetchMediaAssetDataUrl(asset.id, token);
      setSrc(dataUrl);
    } catch {
      setSrc(null);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-[10px] text-slate-400">Загрузка…</div>
    );
  }
  if (!src) {
    return (
      <div className="flex h-full items-center justify-center text-[10px] text-slate-400">Нет превью</div>
    );
  }
  return (
    <img
      src={src}
      alt={asset.title}
      className={className ?? 'h-full w-full object-cover'}
      onError={() => void handleImageError()}
    />
  );
}
