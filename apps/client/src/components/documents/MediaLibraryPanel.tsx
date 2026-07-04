import { useCallback, useId, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import {
  fetchMediaAssetDataUrl,
  formatUploadError,
  useDeleteMediaAssetMutation,
  useListMediaAssetsQuery,
  useUploadMediaAssetMutation,
  type MediaAssetItem,
} from '@folio-mind/store';
import { filterImageFiles } from '../../lib/layout/isImageFile.js';
import { useAppSelector } from '../../hooks/index.js';
import { MediaAssetThumbnail } from './MediaAssetThumbnail.js';

function loadImageSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Не удалось прочитать изображение'));
    };
    img.src = url;
  });
}

function isLowDpi(asset: MediaAssetItem): boolean {
  return asset.width != null && asset.width < 1200;
}

export function MediaLibraryPanel() {
  const uploadInputId = useId();
  const token = useAppSelector((s) => s.auth.token);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [previewAsset, setPreviewAsset] = useState<MediaAssetItem | null>(null);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const { data, isLoading, refetch } = useListMediaAssetsQuery(undefined);
  const [uploadMediaAsset] = useUploadMediaAssetMutation();
  const [deleteMediaAsset, { isLoading: deleting }] = useDeleteMediaAssetMutation();

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = filterImageFiles(files);
      if (list.length === 0) {
        setError('Выберите файлы изображений (PNG, JPG, WebP, GIF)');
        return;
      }
      setError(null);
      setSuccess(null);
      setUploading(true);
      try {
        for (const file of list) {
          let width: number | undefined;
          let height: number | undefined;
          try {
            const size = await loadImageSize(file);
            if (size.width > 0) width = size.width;
            if (size.height > 0) height = size.height;
          } catch {
            // размеры опциональны
          }
          await uploadMediaAsset({ file, width, height }).unwrap();
        }
        await refetch();
        setSuccess(
          list.length === 1
            ? `«${list[0]!.name}» добавлен в медиатеку`
            : `Добавлено файлов: ${list.length}`,
        );
      } catch (err) {
        setError(formatUploadError(err, 'Не удалось загрузить в медиатеку'));
      } finally {
        setUploading(false);
      }
    },
    [refetch, uploadMediaAsset],
  );

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const list = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (list.length > 0) {
      void uploadFiles(list);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOver(false);
    const list = Array.from(event.dataTransfer.files ?? []);
    if (list.length > 0) {
      void uploadFiles(list);
    }
  }

  async function openPreview(asset: MediaAssetItem) {
    setPreviewAsset(asset);
    setPreviewDataUrl(null);
    setPreviewLoading(true);
    setError(null);
    try {
      const dataUrl = await fetchMediaAssetDataUrl(asset.id, token);
      setPreviewDataUrl(dataUrl);
    } catch (err) {
      setPreviewAsset(null);
      setError(err instanceof Error ? err.message : 'Не удалось открыть превью');
    } finally {
      setPreviewLoading(false);
    }
  }

  function closePreview() {
    setPreviewAsset(null);
    setPreviewDataUrl(null);
    setPreviewLoading(false);
  }

  async function handleDelete(asset: MediaAssetItem) {
    const ok = window.confirm(`Удалить «${asset.title}» из медиатеки? Файл в S3 будет удалён.`);
    if (!ok) return;
    setError(null);
    try {
      await deleteMediaAsset({ assetId: asset.id }).unwrap();
      if (previewAsset?.id === asset.id) closePreview();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить');
    }
  }

  const items = data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-800">Всего файлов: {items.length}</p>
        <label
          htmlFor={uploadInputId}
          className={`cursor-pointer rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 ${uploading ? 'pointer-events-none opacity-50' : ''}`}
        >
          {uploading ? 'Загрузка…' : 'Добавить в медиатеку'}
        </label>
      </div>

      <input
        id={uploadInputId}
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={handleFileChange}
      />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={[
          'rounded-xl border-2 border-dashed px-4 py-6 text-center transition',
          dragOver ? 'border-folio-400 bg-folio-50/80' : 'border-slate-200 bg-white',
        ].join(' ')}
      >
        <p className="text-sm text-slate-700">
          Перетащите изображения сюда или нажмите «Добавить в медиатеку»
        </p>
        <p className="mt-1 text-xs text-slate-500">PNG, JPG, WebP, GIF · до 100 МБ</p>
      </div>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {success}
        </p>
      )}

      <p className="text-[11px] text-slate-500">
        Все изображения аккаунта. Чтобы вставить в PDF, откройте документ → «Инструменты» → «Макет» →
        «В макет» у нужного превью.
      </p>

      {isLoading && <p className="text-xs text-slate-500">Загрузка медиатеки…</p>}
      {!isLoading && items.length === 0 && (
        <p className="text-xs text-slate-500">Пока пусто — загрузите первое изображение.</p>
      )}

      {items.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {items.map((asset) => (
            <li
              key={asset.id}
              className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
            >
              <div className="aspect-[4/3] bg-slate-100">
                <button
                  type="button"
                  onClick={() => void openPreview(asset)}
                  className="block h-full w-full cursor-zoom-in"
                  title="Открыть в полном размере"
                >
                  <MediaAssetThumbnail asset={asset} token={token} />
                </button>
              </div>
              <div className="space-y-1 px-2 py-1.5">
                <p className="truncate text-[11px] font-medium text-slate-800" title={asset.title}>
                  {asset.title}
                </p>
                {asset.width && asset.height && (
                  <p className="text-[10px] text-slate-500">
                    {asset.width}×{asset.height}
                    {isLowDpi(asset) ? ' · низкое разрешение' : ''}
                  </p>
                )}
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => void openPreview(asset)}
                    className="cursor-pointer rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600 hover:bg-slate-50"
                  >
                    Открыть
                  </button>
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={() => void handleDelete(asset)}
                    className="cursor-pointer rounded border border-rose-200 px-1.5 py-0.5 text-[10px] text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                    title="Удалить из медиатеки"
                  >
                    Удалить
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {previewAsset && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Просмотр: ${previewAsset.title}`}
          onClick={closePreview}
        >
          <div
            className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-900">{previewAsset.title}</p>
                {previewAsset.width && previewAsset.height && (
                  <p className="text-xs text-slate-500">
                    {previewAsset.width}×{previewAsset.height}
                    {isLowDpi(previewAsset) ? ' · низкое разрешение' : ''}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={closePreview}
                className="shrink-0 cursor-pointer rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-600 hover:bg-slate-50"
              >
                Закрыть
              </button>
            </div>
            <div className="flex max-h-[calc(90vh-4rem)] items-center justify-center bg-slate-100 p-4">
              {previewLoading && <p className="text-sm text-slate-500">Загрузка…</p>}
              {!previewLoading && previewDataUrl && (
                <img
                  src={previewDataUrl}
                  alt={previewAsset.title}
                  className="max-h-[calc(90vh-6rem)] max-w-full object-contain"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
