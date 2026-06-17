import { useRef, useState } from 'react';
import {
  uploadPdfVersion,
  useCompleteUploadMutation,
  useCreateDocumentVersionMutation,
  useDeleteDocumentVersionMutation,
  useLazyGetDownloadUrlQuery,
  useUploadVersionFileMutation,
} from '@folio-mind/store';
import { DownloadIcon } from '../ui/icons/DownloadIcon.js';
import { DeleteDocumentButton } from './DeleteDocumentButton.js';
import { DocumentVersionIntegrityBadge } from './DocumentVersionIntegrityBadge.js';

async function waitMs(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

const STATUS_LABEL: Record<string, string> = {
  pending_upload: 'не загружен',
  processing: 'обработка',
  ready: 'готов',
  failed: 'ошибка',
};

function getDisplayStatus(status: string): string {
  if (status === 'processing') return 'готов к просмотру';
  return STATUS_LABEL[status] ?? status;
}

function getUploadStage(progress: number | null): string {
  if (progress === null || progress <= 0) return 'Подготовка…';
  if (progress < 100) return 'Загрузка файла в хранилище…';
  return 'Подтверждение загрузки…';
}

export type DocumentVersionItem = {
  id: string;
  version: number;
  status: string;
  size: string;
  mimeType: string;
  pageCount?: number | null;
  createdAt: string;
  integrityStatus?: string | null;
  integritySummary?: string | null;
  integrityScore?: number | null;
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
  const [showUploadDone, setShowUploadDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createVersion] = useCreateDocumentVersionMutation();
  const [completeUpload] = useCompleteUploadMutation();
  const [uploadVersionFile] = useUploadVersionFileMutation();
  const [deleteVersion, { isLoading: deletingVersion }] = useDeleteDocumentVersionMutation();
  const [fetchDownloadUrl] = useLazyGetDownloadUrlQuery();

  async function handleNewVersion(file: File) {
    let latestProgress = 0;
    const handleProgress = (percent: number) => {
      latestProgress = percent;
      setUploadProgress(percent);
    };
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Только PDF');
      return;
    }
    setError(null);
    setUploading(true);
    setShowUploadDone(false);
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
        onProgress: handleProgress,
      });

      onSelectVersion(created.versionId);
      setShowUploadDone(true);
      await waitMs(350);
    } catch (e) {
      const msg =
        e && typeof e === 'object' && 'data' in e && typeof (e as { data: unknown }).data === 'string'
          ? (e as { data: string }).data
          : e instanceof Error
            ? e.message
            : 'Не удалось загрузить версию';
      setError(msg);
    } finally {
      if (latestProgress === 100) {
        await waitMs(150);
      }
      setUploading(false);
      setShowUploadDone(false);
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

  async function handleDeleteVersion(versionId: string, versionNumber: number) {
    const ok = window.confirm(
      `Удалить версию ${versionNumber}?\n\nБудут удалены файл, превью и пересказ этой версии. Восстановить нельзя.`,
    );
    if (!ok) return;
    try {
      setError(null);
      await deleteVersion({ documentId, versionId }).unwrap();
    } catch {
      setError('Не удалось удалить версию');
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
      {uploading && uploadProgress !== null && (
        <p className="mt-2 text-xs text-slate-500">
          {showUploadDone && uploadProgress === 100 ? '✓ Готово' : getUploadStage(uploadProgress)}
        </p>
      )}

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
                  {date} · {getDisplayStatus(v.status)} · {sizeMb} МБ
                </span>
                {(v.status === 'ready' || v.integrityStatus) && (
                  <span className="mt-1 block">
                    <DocumentVersionIntegrityBadge
                      status={
                        v.status === 'processing' && !v.integrityStatus
                          ? 'pending'
                          : (v.integrityStatus as
                              | 'intact'
                              | 'modified'
                              | 'cannot_verify'
                              | 'failed'
                              | null)
                      }
                      summary={v.integritySummary}
                      score={v.integrityScore}
                    />
                  </span>
                )}
              </button>
              {v.status !== 'pending_upload' && (
                <button
                  type="button"
                  title="Скачать PDF этой версии"
                  onClick={() => void handleDownload(v.id)}
                  className="flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-folio-700 hover:bg-folio-50"
                >
                  <DownloadIcon className="h-3.5 w-3.5 shrink-0" />
                  <span>Скачать</span>
                </button>
              )}
              <DeleteDocumentButton
                title={`Удалить версию ${v.version}`}
                disabled={deletingVersion || versions.length <= 1}
                onClick={() => void handleDeleteVersion(v.id, v.version)}
                variant="list"
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
