import { useMemo, useState } from 'react';
import { FOLIO_MEDIA_DRAG_MIME } from '@folio-mind/store';
import { Link } from 'react-router-dom';
import {
  fetchMediaAssetDataUrl,
  useListMediaAssetsQuery,
  type MediaAssetItem,
} from '@folio-mind/store';
import { useAppSelector } from '../../hooks/index.js';
import { MediaAssetThumbnail } from './MediaAssetThumbnail.js';

const DEFAULT_LIMIT = 2;

type Props = {
  documentId: string;
  versionReady: boolean;
  viewerPage: number;
  onInsertAsset: (asset: MediaAssetItem, dataUrl: string) => Promise<void>;
  maxItems?: number;
};

export function MediaLibraryInsertPanel({
  documentId,
  versionReady,
  viewerPage,
  onInsertAsset,
  maxItems = DEFAULT_LIMIT,
}: Props) {
  const token = useAppSelector((s) => s.auth.token);
  const [insertingId, setInsertingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const { data, isLoading } = useListMediaAssetsQuery({ documentId });

  const sortedItems = useMemo(() => {
    const items = data?.items ?? [];
    return [...items].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [data?.items]);

  const recentItems = useMemo(() => sortedItems.slice(0, maxItems), [sortedItems, maxItems]);
  const visibleItems = expanded ? sortedItems : recentItems;
  const hiddenCount = sortedItems.length - recentItems.length;

  async function handleInsert(asset: MediaAssetItem) {
    if (asset.status !== 'ready') {
      setError('Файл ещё загружается');
      return;
    }
    setInsertingId(asset.id);
    setError(null);
    try {
      const dataUrl = await fetchMediaAssetDataUrl(asset.id, token);
      await onInsertAsset(asset, dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось вставить из медиатеки');
    } finally {
      setInsertingId(null);
    }
  }

  function renderAsset(asset: MediaAssetItem) {
    return (
      <li
        key={asset.id}
        className="overflow-hidden rounded-md border border-slate-200 bg-white"
      >
        <div
          className={[
            'aspect-[4/3] bg-slate-100',
            versionReady && asset.status === 'ready' ? 'cursor-grab active:cursor-grabbing' : '',
          ].join(' ')}
          draggable={versionReady && asset.status === 'ready'}
          onDragStart={(event) => {
            if (asset.status !== 'ready') {
              event.preventDefault();
              return;
            }
            event.dataTransfer.setData(
              FOLIO_MEDIA_DRAG_MIME,
              JSON.stringify({ assetId: asset.id, title: asset.title }),
            );
            event.dataTransfer.effectAllowed = 'copy';
          }}
        >
          <MediaAssetThumbnail asset={asset} token={token} />
        </div>
        <div className="space-y-1 px-1.5 py-1">
          <p className="truncate text-[10px] font-medium text-slate-800" title={asset.title}>
            {asset.title}
          </p>
          <button
            type="button"
            disabled={!versionReady || insertingId === asset.id}
            onClick={() => void handleInsert(asset)}
            className="w-full cursor-pointer rounded border border-folio-200 bg-folio-50 px-1 py-0.5 text-[10px] font-medium text-folio-800 hover:bg-folio-100 disabled:opacity-50"
          >
            {insertingId === asset.id ? '…' : 'В макет'}
          </button>
        </div>
      </li>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-slate-700">Вставить из медиатеки</p>
        <Link
          to="/app/media"
          className="shrink-0 text-[11px] font-medium text-folio-700 underline-offset-2 hover:underline"
        >
          Открыть медиатеку →
        </Link>
      </div>

      <p className="text-[11px] text-slate-500">
        Файлы аккаунта и этого документа. Перетащите превью на лист PDF или нажмите «В макет» — на
        стр. {viewerPage}.
      </p>

      {isLoading && <p className="text-xs text-slate-500">Загрузка…</p>}

      {!isLoading && sortedItems.length === 0 && (
        <p className="text-xs text-slate-500">
          Пока пусто.{' '}
          <Link to="/app/media" className="text-folio-700 underline-offset-2 hover:underline">
            Добавьте изображения в медиатеку
          </Link>
          .
        </p>
      )}

      {sortedItems.length > 0 && (
        <div className={expanded ? 'scrollbar-thin max-h-[320px] overflow-y-auto pr-1' : ''}>
          <ul className="grid grid-cols-2 gap-2">{visibleItems.map((asset) => renderAsset(asset))}</ul>
        </div>
      )}

      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="cursor-pointer rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
        >
          {expanded ? 'Свернуть' : `Показать все (${sortedItems.length})`}
        </button>
      )}

      {error && (
        <p className="rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
