import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDeleteDocumentMutation, useListDocumentsQuery } from '@folio-mind/store';
import { useAppSelector } from '../../hooks/index.js';
import { useBackgroundUpload } from '../../context/background-upload-provider.js';
import { DeleteDocumentButton } from '../../components/documents/DeleteDocumentButton.js';
import { hasUserSourceDocx } from '../../lib/documents/sourceDocx.js';
import { getUploadStage } from '../../lib/uploads/uploadStage.js';

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

export function DashboardPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const docxInputRef = useRef<HTMLInputElement>(null);
  const [pendingPdf, setPendingPdf] = useState<File | null>(null);
  const [pendingDocx, setPendingDocx] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const uploadState = useAppSelector((s) => s.backgroundUpload);
  const { uploadFromDashboard } = useBackgroundUpload();
  const active = uploadState.active && uploadState.kind === 'dashboard';
  const progress = active ? uploadState.progress : 0;
  const showDone = active && uploadState.showDone;
  const uploadError = active ? uploadState.error : null;
  const { data: list, refetch } = useListDocumentsQuery({ limit: 20 });
  const [deleteDocument] = useDeleteDocumentMutation();

  const error = localError ?? uploadError;

  const clearPending = useCallback(() => {
    setPendingPdf(null);
    setPendingDocx(null);
    if (inputRef.current) inputRef.current.value = '';
    if (docxInputRef.current) docxInputRef.current.value = '';
  }, []);

  const startUpload = useCallback(
    (pdfFile: File, docxFile?: File) => {
      if (pdfFile.type !== 'application/pdf' && !pdfFile.name.toLowerCase().endsWith('.pdf')) {
        setLocalError('Только PDF');
        return;
      }
      setLocalError(null);
      clearPending();
      uploadFromDashboard(pdfFile, docxFile);
    },
    [clearPending, uploadFromDashboard],
  );

  const attachPdf = useCallback(
    (pdfFile: File) => {
      if (pendingDocx) {
        startUpload(pdfFile, pendingDocx);
        return;
      }
      setPendingPdf(pdfFile);
      setLocalError(null);
    },
    [pendingDocx, startUpload],
  );

  const attachDocx = useCallback(
    (docxFile: File) => {
      if (pendingPdf) {
        startUpload(pendingPdf, docxFile);
        return;
      }
      setPendingDocx(docxFile);
      setLocalError(null);
    },
    [pendingPdf, startUpload],
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">Документы</h1>

      <div
        className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-5 sm:mt-8 sm:p-8 lg:p-10"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const files = Array.from(e.dataTransfer.files);
          const pdfFile = files.find((f) => f.name.toLowerCase().endsWith('.pdf'));
          const docxFile = files.find((f) => f.name.toLowerCase().endsWith('.docx'));
          if (pdfFile && docxFile) {
            startUpload(pdfFile, docxFile);
            return;
          }
          if (pdfFile) attachPdf(pdfFile);
          else if (docxFile) attachDocx(docxFile);
        }}
      >
        <div className="mx-auto max-w-lg text-center">
          <p className="text-base font-medium text-slate-700 sm:text-lg">Перетащите PDF сюда</p>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-400 sm:text-sm">
            Загрузка в S3. Исходный DOCX — опционально, для качественных правок в Word.
          </p>
        </div>

        {pendingPdf && (
          <div className="mx-auto mt-5 flex max-w-lg items-center gap-3 rounded-xl border border-folio-200 bg-folio-50/80 px-3 py-2.5 sm:px-4">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-folio-100 text-sm font-bold text-folio-700"
              aria-hidden
            >
              PDF
            </span>
            <div className="min-w-0 flex-1 text-left">
              <p className="text-[11px] font-medium uppercase tracking-wide text-folio-700">
                PDF-документ
              </p>
              <p className="truncate text-sm font-medium text-folio-950" title={pendingPdf.name}>
                {pendingPdf.name}
              </p>
            </div>
            <button
              type="button"
              disabled={active}
              onClick={() => {
                setPendingPdf(null);
                if (inputRef.current) inputRef.current.value = '';
              }}
              className="shrink-0 cursor-pointer rounded-lg px-2.5 py-1.5 text-xs font-medium text-folio-800 hover:bg-folio-100 disabled:opacity-50"
            >
              Убрать
            </button>
          </div>
        )}

        {pendingDocx && (
          <div className="mx-auto mt-5 flex max-w-lg items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-2.5 sm:px-4">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-sm font-bold text-emerald-700"
              aria-hidden
            >
              W
            </span>
            <div className="min-w-0 flex-1 text-left">
              <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-700">
                Исходный DOCX
              </p>
              <p className="truncate text-sm font-medium text-emerald-950" title={pendingDocx.name}>
                {pendingDocx.name}
              </p>
            </div>
            <button
              type="button"
              disabled={active}
              onClick={() => {
                setPendingDocx(null);
                if (docxInputRef.current) docxInputRef.current.value = '';
              }}
              className="shrink-0 cursor-pointer rounded-lg px-2.5 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
            >
              Убрать
            </button>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) attachPdf(file);
            if (inputRef.current) inputRef.current.value = '';
          }}
        />
        <input
          ref={docxInputRef}
          type="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (!file.name.toLowerCase().endsWith('.docx')) {
              setLocalError('Только файлы .docx');
              e.target.value = '';
              return;
            }
            setLocalError(null);
            attachDocx(file);
          }}
        />

        <div className="mx-auto mt-6 flex max-w-lg flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            disabled={active}
            onClick={() => {
              if (pendingPdf) {
                startUpload(pendingPdf, pendingDocx ?? undefined);
              } else {
                inputRef.current?.click();
              }
            }}
            className="w-full rounded-lg bg-folio-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-folio-700 disabled:opacity-50 sm:min-w-[10.5rem]"
          >
            {active
              ? `Загрузка ${progress}%…`
              : pendingPdf
                ? pendingDocx
                  ? 'Загрузить PDF + DOCX'
                  : 'Загрузить PDF'
                : 'Выбрать PDF'}
          </button>
          <button
            type="button"
            disabled={active}
            onClick={() => docxInputRef.current?.click()}
            className={`w-full rounded-lg border px-5 py-2.5 text-sm font-medium disabled:opacity-50 sm:min-w-[10.5rem] ${
              pendingDocx
                ? 'border-emerald-300 bg-white text-emerald-800 hover:bg-emerald-50'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {pendingDocx ? 'Заменить DOCX' : 'Добавить DOCX'}
          </button>
        </div>

        <p className="mx-auto mt-4 max-w-md text-center text-xs leading-relaxed text-slate-400">
          {active
            ? 'Загрузка продолжается в фоне — можно открыть другой документ.'
            : uploadState.active
              ? 'Идёт фоновая загрузка — см. полосу прогресса вверху страницы.'
              : pendingPdf && pendingDocx
              ? 'Оба файла готовы — нажмите «Загрузить PDF + DOCX» или добавьте второй файл в любой момент.'
              : pendingPdf
                ? 'PDF выбран — добавьте DOCX или нажмите «Загрузить PDF» без Word.'
                : pendingDocx
                  ? 'DOCX выбран — теперь выберите PDF; файлы загрузятся вместе.'
                  : 'DOCX сохраняет таблицы, формулы и стили при «Применить правки». Порядок выбора не важен.'}
        </p>

        {active && (
          <div className="mx-auto mt-5 w-full max-w-md">
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full bg-folio-600 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {showDone && progress === 100 ? '✓ Готово' : getUploadStage(progress)}
            </p>
          </div>
        )}
        {error && <p className="mx-auto mt-4 max-w-md text-center text-sm text-red-600">{error}</p>}
      </div>

      <ul className="mt-8 space-y-3 sm:mt-10">
        {list?.items.map((doc) => (
          <li
            key={doc.id}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 hover:border-folio-300 sm:pr-2 sm:pl-0 sm:py-0"
          >
            <Link
              to={`/app/documents/${doc.id}`}
              className="min-w-0 flex-1 px-2 py-2 sm:px-4 sm:py-3"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate font-medium text-slate-900">{doc.title}</span>
                {hasUserSourceDocx(doc.latestVersion?.sourceDocxKey) && (
                  <span
                    className="shrink-0 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-200/80"
                    title="К документу прикреплён исходный DOCX"
                  >
                    + DOCX
                  </span>
                )}
              </div>
              {doc.latestVersion && (
                <span className="mt-0.5 block text-xs text-slate-400 sm:mt-1">
                  {getDisplayStatus(doc.latestVersion.status)}
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
                try {
                  await deleteDocument(doc.id).unwrap();
                  await refetch();
                } catch (e) {
                  const msg = e instanceof Error ? e.message : 'Ошибка при удалении';
                  setLocalError(msg);
                }
              }}
            />
          </li>
        ))}
        {list?.items.length === 0 && !active && (
          <li className="text-sm text-slate-400">Пока нет документов</li>
        )}
      </ul>
    </div>
  );
}
