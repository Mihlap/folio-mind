import { useCallback, useRef, useState } from 'react';
import { useAppSelector } from '../../hooks/index.js';
import { useBackgroundUpload } from '../../context/useBackgroundUpload.js';
import { getUploadStage } from '../../lib/uploads/uploadStage.js';

type Props = {
  projectId?: string;
  className?: string;
  title?: string;
  subtitle?: string;
};

export function DocumentUploadZone({
  projectId,
  className = '',
  title,
  subtitle,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const docxInputRef = useRef<HTMLInputElement>(null);
  const [pendingPdf, setPendingPdf] = useState<File | null>(null);
  const [pendingDocx, setPendingDocx] = useState<File | null>(null);
  const [forceOcr, setForceOcr] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const uploadState = useAppSelector((s) => s.backgroundUpload);
  const { uploadFromDashboard, uploadFromDocxOnly } = useBackgroundUpload();
  const active = uploadState.active && uploadState.kind === 'dashboard';
  const progress = active ? uploadState.progress : 0;
  const showDone = active && uploadState.showDone;
  const uploadError = active ? uploadState.error : null;
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
      uploadFromDashboard(pdfFile, docxFile, projectId, { forceOcr });
    },
    [projectId, clearPending, uploadFromDashboard, forceOcr],
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

  const heading =
    title && !pendingPdf && !pendingDocx
      ? title
      : pendingDocx && !pendingPdf
        ? 'DOCX выбран — создадим PDF для просмотра'
        : 'Перетащите PDF или DOCX сюда';

  const subheading =
    subtitle && !pendingPdf && !pendingDocx
      ? subtitle
      : pendingDocx && !pendingPdf
        ? 'PDF для просмотра создастся из Word автоматически (Gotenberg).'
        : pendingPdf && !pendingDocx
          ? 'Файл загружается. DOCX улучшит качество «Применить правки».'
          : 'Файл загружается. Исходный DOCX — опционально, для качественных правок в Word.';

  return (
    <div
      className={`rounded-2xl border border-dashed border-slate-300 bg-white p-5 sm:p-8 lg:p-10 ${className}`}
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
        <p className="text-base font-medium text-slate-700 sm:text-lg">{heading}</p>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-400 sm:text-sm">{subheading}</p>
      </div>

      {pendingPdf && !pendingDocx && !active && (
        <div className="mx-auto mt-5 max-w-lg rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-left">
          <p className="text-sm font-medium text-amber-950">Добавьте исходный DOCX?</p>
          <p className="mt-1 text-xs leading-relaxed text-amber-900/90">
            Для «Применить правки» Word-слой даёт лучшее качество: таблицы, формулы и стили не
            ломаются. PDF можно загрузить и без DOCX — тогда сработает PDF→DOCX или overlay.
          </p>
          <button
            type="button"
            onClick={() => docxInputRef.current?.click()}
            className="mt-2 cursor-pointer rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
          >
            Добавить DOCX
          </button>
        </div>
      )}

      {pendingDocx && !pendingPdf && !active && (
        <div className="mx-auto mt-5 max-w-lg rounded-xl border border-emerald-200 bg-emerald-50/90 px-4 py-3 text-left">
          <p className="text-sm font-medium text-emerald-950">Добавить PDF?</p>
          <p className="mt-1 text-xs leading-relaxed text-emerald-900/90">
            Если у вас уже есть PDF этой версии, загрузите оба файла: просмотр — с PDF, правки — из
            DOCX. Или нажмите «Создать из DOCX» — PDF сгенерируется автоматически.
          </p>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="mt-2 cursor-pointer rounded-lg bg-folio-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-folio-700"
          >
            Добавить PDF
          </button>
        </div>
      )}

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
        <div className="mx-auto mt-5 flex max-w-lg flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-2.5 sm:px-4">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-sm font-bold text-emerald-700"
            aria-hidden
          >
            W
          </span>
          <div className="min-w-0 flex-1 text-left">
            <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-700">
              {pendingPdf ? 'Исходный DOCX' : 'Word-документ'}
            </p>
            <p className="truncate text-sm font-medium text-emerald-950" title={pendingDocx.name}>
              {pendingDocx.name}
            </p>
          </div>
          <div className="flex w-full shrink-0 flex-wrap items-center justify-end gap-1 sm:w-auto">
            <button
              type="button"
              disabled={active}
              onClick={() => docxInputRef.current?.click()}
              className="cursor-pointer rounded-lg px-2.5 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
            >
              Заменить
            </button>
            <button
              type="button"
              disabled={active}
              onClick={() => {
                setPendingDocx(null);
                if (docxInputRef.current) docxInputRef.current.value = '';
              }}
              className="cursor-pointer rounded-lg px-2.5 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
            >
              Убрать
            </button>
          </div>
        </div>
      )}

      {(pendingPdf || pendingDocx) && !active && (
        <label className="mx-auto mt-4 flex max-w-lg cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-left sm:px-4">
          <input
            type="checkbox"
            checked={forceOcr}
            onChange={(e) => setForceOcr(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-folio-600"
          />
          <span className="min-w-0">
            <span className="block text-xs font-medium text-slate-700">
              Распознать текст после загрузки
            </span>
            <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">
              Для сканов без текстового слоя. По умолчанию распознавание включается автоматически,
              когда текст не найден — галочка нужна, если сработала эвристика неверно.
            </span>
          </span>
        </label>
      )}

      <input
        ref={inputRef}        type="file"
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

      <div className="mx-auto mt-6 flex max-w-lg flex-wrap justify-center gap-3">
        <button
          type="button"
          disabled={active}
          onClick={() => {
            if (pendingDocx && !pendingPdf) {
              uploadFromDocxOnly(pendingDocx, projectId);
              clearPending();
              return;
            }
            if (pendingPdf) {
              startUpload(pendingPdf, pendingDocx ?? undefined);
            } else {
              inputRef.current?.click();
            }
          }}
          className="w-full min-w-0 rounded-lg bg-folio-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-folio-700 disabled:opacity-50 sm:w-auto sm:min-w-[10.5rem]"
        >
          {active
            ? `Загрузка ${progress}%…`
            : pendingDocx && !pendingPdf
              ? 'Создать из DOCX'
              : pendingPdf
                ? pendingDocx
                  ? 'Загрузить PDF + DOCX'
                  : 'Загрузить PDF'
                : 'Выбрать PDF'}
        </button>
        {!(pendingPdf && !pendingDocx) && !(pendingDocx && !pendingPdf) && (
          <button
            type="button"
            disabled={active}
            onClick={() => docxInputRef.current?.click()}
            className={`w-full min-w-0 rounded-lg border px-5 py-2.5 text-sm font-medium disabled:opacity-50 sm:w-auto sm:min-w-[10.5rem] ${
              pendingDocx
                ? 'border-emerald-300 bg-white text-emerald-800 hover:bg-emerald-50'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {pendingDocx ? 'Заменить DOCX' : 'Добавить DOCX'}
          </button>
        )}
      </div>

      <p className="mx-auto mt-4 max-w-md text-center text-xs leading-relaxed text-slate-400">
        {active
          ? 'Загрузка продолжается в фоне — можно открыть другой документ.'
          : pendingPdf && pendingDocx
            ? 'Оба файла готовы — нажмите «Загрузить PDF + DOCX» или добавьте второй файл в любой момент.'
            : pendingPdf
              ? 'PDF выбран — добавьте DOCX или нажмите «Загрузить PDF» без Word.'
              : pendingDocx
                ? 'Нажмите «Создать из DOCX» или добавьте PDF в подсказке выше.'
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
      {uploadState.error && !active && (
        <p className="mx-auto mt-1 max-w-md text-center text-xs text-slate-500">
          Если документ уже создан, он может отображаться со статусом «не загружен» — откройте его и
          загрузите файл повторно.
        </p>
      )}
    </div>
  );
}
