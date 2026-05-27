import { useRef, useState } from 'react';
import {
  uploadPdfVersion,
  useCompleteUploadMutation,
  useCreateDocumentVersionMutation,
  useLazyGetDownloadUrlQuery,
  useUploadVersionFileMutation,
} from '@folio-mind/store';

const STATUS_LABEL: Record<string, string> = {
  pending_upload: 'не загружен',
  processing: 'обработка',
  ready: 'готов',
  failed: 'ошибка',
};

export type DocumentVersionItem = {
  id: string;
  version: number;
  status: string;
  size: string;
  mimeType: string;
  createdAt: string;
};

type Props = {
  documentId: string;
  versions: DocumentVersionItem[];
  selectedVersionId: string | undefined;
  onSelectVersion: (versionId: string) => void;
};

export function DocumentVersionsPanel({
  documentId,
  versions,
  selectedVersionId,
  onSelectVersion,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createVersion] = useCreateDocumentVersionMutation();
  const [completeUpload] = useCompleteUploadMutation();
  const [uploadVersionFile] = useUploadVersionFileMutation();
  const [fetchDownloadUrl] = useLazyGetDownloadUrlQuery();

  async function handleNewVersion(file: File) {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Только PDF');
      return;
    }
    setError(null);
    setUploading(true);
    setUploadProgress(0);
    try {
      const created = await createVersion({
        documentId,
        fileName: file.name,
        mimeType: file.type || 'application/pdf',
        size: file.size,
      }).unwrap();

      await uploadPdfVersion({
        documentId,
        versionId: created.versionId,
        file,
        uploadUrl: created.uploadUrl,
        completeUpload: (args) => completeUpload(args).unwrap(),
        fallbackProxyUpload: (args) => uploadVersionFile(args).unwrap(),
        onProgress: setUploadProgress,
      });

      onSelectVersion(created.versionId);
    } catch (e) {
      const msg =
        e && typeof e === 'object' && 'data' in e && typeof (e as { data: unknown }).data === 'string'
          ? (e as { data: string }).data
          : e instanceof Error
            ? e.message
            : 'Не удалось загрузить версию';
      setError(msg);
    } finally {
      setUploading(false);
      setUploadProgress(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function handleDownload(versionId: string) {
    try {
      const { url } = await fetchDownloadUrl({ documentId, versionId }).unwrap();
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      setError('Не удалось получить ссылку на скачивание');
    }
  }

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-900">Версии документа</h2>
        <div>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleNewVersion(file);
            }}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading
              ? uploadProgress !== null
                ? `Загрузка ${uploadProgress}%…`
                : 'Загрузка…'
              : 'Новая версия PDF'}
          </button>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <ul className="mt-4 divide-y divide-slate-100">
        {versions.map((v, index) => {
          const isSelected = v.id === selectedVersionId;
          const isLatest = index === 0;
          const date = new Date(v.createdAt).toLocaleString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          });
          const sizeMb = v.size ? (Number(v.size) / (1024 * 1024)).toFixed(1) : '—';

          return (
            <li
              key={v.id}
              className={`flex flex-wrap items-center gap-2 py-3 text-sm ${
                isSelected ? 'bg-folio-50/60 -mx-2 rounded-lg px-2' : ''
              }`}
            >
              <button
                type="button"
                onClick={() => onSelectVersion(v.id)}
                disabled={v.status === 'pending_upload'}
                className="min-w-0 flex-1 cursor-pointer text-left disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="font-medium text-slate-900">Версия {v.version}</span>
                {isLatest && (
                  <span className="ml-2 rounded-full bg-folio-100 px-2 py-0.5 text-xs font-medium text-folio-700">
                    последняя
                  </span>
                )}
                {isSelected && (
                  <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600">
                    просмотр
                  </span>
                )}
                <span className="mt-0.5 block text-xs text-slate-500">
                  {date} · {STATUS_LABEL[v.status] ?? v.status} · {sizeMb} МБ
                </span>
              </button>
              {v.status !== 'pending_upload' && (
                <button
                  type="button"
                  onClick={() => void handleDownload(v.id)}
                  className="cursor-pointer rounded-lg px-2 py-1 text-xs font-medium text-folio-600 hover:bg-folio-50"
                >
                  Скачать
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
