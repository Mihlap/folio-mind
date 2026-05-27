import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  uploadPdfVersion,
  useCompleteUploadMutation,
  useCreateDocumentMutation,
  useDeleteDocumentMutation,
  useListDocumentsQuery,
  useMeQuery,
  useUploadVersionFileMutation,
} from '@folio-mind/store';
import { DeleteDocumentButton } from '../components/DeleteDocumentButton.js';

const STATUS_LABEL: Record<string, string> = {
  pending_upload: 'не загружен',
  processing: 'обработка',
  ready: 'готов',
  failed: 'ошибка',
};

export function DashboardPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: me } = useMeQuery();
  const { data: list, refetch } = useListDocumentsQuery({ limit: 20 });
  const [createDocument] = useCreateDocumentMutation();
  const [completeUpload] = useCompleteUploadMutation();
  const [uploadVersionFile] = useUploadVersionFileMutation();
  const [deleteDocument] = useDeleteDocumentMutation();

  const handleFile = useCallback(
    async (file: File) => {
      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        setError('Только PDF');
        return;
      }
      setError(null);
      setUploading(true);
      setUploadProgress(0);
      try {
        const title = file.name.replace(/\.pdf$/i, '');
        const created = await createDocument({
          title,
          fileName: file.name,
          mimeType: file.type || 'application/pdf',
          size: file.size,
        }).unwrap();

        await uploadPdfVersion({
          documentId: created.document.id,
          versionId: created.versionId,
          file,
          uploadUrl: created.uploadUrl,
          completeUpload: (args) => completeUpload(args).unwrap(),
          fallbackProxyUpload: (args) => uploadVersionFile(args).unwrap(),
          onProgress: setUploadProgress,
        });

        await refetch();
      } catch (e) {
        const msg =
          e && typeof e === 'object' && 'data' in e && typeof (e as { data: unknown }).data === 'string'
            ? (e as { data: string }).data
            : e instanceof Error
              ? e.message
              : 'Ошибка загрузки';
        setError(msg);
      } finally {
        setUploading(false);
        setUploadProgress(null);
      }
    },
    [createDocument, completeUpload, uploadVersionFile, refetch],
  );

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-slate-900">Документы</h1>

      <div
        className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files[0];
          if (file) void handleFile(file);
        }}
      >
        <p className="text-slate-600">Перетащите PDF сюда</p>
        <p className="mt-1 text-xs text-slate-400">Загрузка напрямую в S3 (presigned URL)</p>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="mt-4 rounded-lg bg-folio-600 px-4 py-2 text-sm font-medium text-white hover:bg-folio-700 disabled:opacity-50"
        >
          {uploading
            ? uploadProgress !== null
              ? `Загрузка ${uploadProgress}%…`
              : 'Загрузка…'
            : 'Выбрать PDF'}
        </button>
        {uploading && uploadProgress !== null && (
          <div className="mx-auto mt-4 h-2 w-64 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full bg-folio-600 transition-all"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        )}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>

      <ul className="mt-10 space-y-3">
        {list?.items.map((doc) => (
          <li
            key={doc.id}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white pr-2 hover:border-folio-300"
          >
            <Link to={`/app/documents/${doc.id}`} className="min-w-0 flex-1 px-4 py-3">
              <span className="font-medium text-slate-900">{doc.title}</span>
              {doc.latestVersion && (
                <span className="ml-2 text-xs text-slate-400">
                  {STATUS_LABEL[doc.latestVersion.status] ?? doc.latestVersion.status}
                </span>
              )}
            </Link>
            <DeleteDocumentButton
              title={`Удалить документ «${doc.title}»`}
              variant="list"
              onClick={async () => {
                if (
                  !window.confirm(
                    `Удалить документ «${doc.title}»?\n\nPDF и все версии будут удалены без восстановления.`,
                  )
                ) {
                  return;
                }
                await deleteDocument(doc.id).unwrap();
                await refetch();
              }}
            />
          </li>
        ))}
        {list?.items.length === 0 && !uploading && (
          <li className="text-sm text-slate-400">Пока нет документов</li>
        )}
      </ul>

      {me && (
        <p className="mt-6 text-xs text-slate-400">Workspace · tenant {me.tenantId.slice(0, 8)}…</p>
      )}
    </div>
  );
}
