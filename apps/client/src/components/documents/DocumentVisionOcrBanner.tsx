import { TEXTLESS_SCAN_EDIT_REASON, TEXTLESS_SCAN_REASON } from '@folio-mind/store';

type Props = {
  status: string | null | undefined;
  textSource?: string | null;
  onDismiss?: () => void;
  onRunOcr?: () => void;
  ocrRunning?: boolean;
  ocrProgress?: { pagesDone: number; pagesTotal: number } | null;
  ocrError?: string | null;
  canRunOcr?: boolean;
  runOcrUnavailableReason?: string | null;
};

function OcrButton({
  onRunOcr,
  ocrRunning,
  progress,
  label,
}: {
  onRunOcr?: () => void;
  ocrRunning?: boolean;
  progress?: { pagesDone: number; pagesTotal: number } | null;
  label: string;
}) {
  if (!onRunOcr) return null;
  const showProgress =
    ocrRunning && progress && progress.pagesTotal > 0 && progress.pagesDone > 0;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onRunOcr}
        disabled={ocrRunning}
        className="cursor-pointer rounded-md bg-white/80 px-2.5 py-1 text-[11px] font-medium text-current shadow-sm ring-1 ring-current/10 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        {ocrRunning ? 'Распознаём…' : label}
      </button>
      {showProgress && (
        <span className="text-[11px] opacity-80">
          {progress!.pagesDone} / {progress!.pagesTotal}
        </span>
      )}
    </div>
  );
}

export function DocumentVisionOcrBanner({
  status,
  textSource,
  onDismiss,
  onRunOcr,
  ocrRunning = false,
  ocrProgress = null,
  ocrError = null,
  canRunOcr = true,
  runOcrUnavailableReason = null,
}: Props) {
  if (!status || status === 'not_needed') return null;

  if (status === 'ready' && textSource === 'vision-ocr') {
    return (
      <div className="relative mb-2 shrink-0 rounded-xl border border-emerald-200 bg-emerald-50/90 px-3 py-2.5 text-emerald-950">
        {onDismiss && (
          <button
            type="button"
            title="Скрыть"
            aria-label="Скрыть"
            onClick={onDismiss}
            className="absolute right-1.5 top-1.5 flex h-7 w-7 cursor-pointer items-center justify-center rounded text-lg text-current/40 hover:bg-white/60 hover:text-current/70"
          >
            ✕
          </button>
        )}
        <p className="pr-6 text-xs font-medium">Текст скана распознан</p>
        <p className="mt-0.5 text-[11px] leading-relaxed opacity-90">
          Чат и сверка используют распознанный текст. Поиск по страницам в просмотрщике и{' '}
          {TEXTLESS_SCAN_EDIT_REASON}
        </p>
      </div>
    );
  }

  if (status === 'queued' || status === 'processing') {
    return (
      <div className="mb-2 shrink-0 rounded-xl border border-sky-200 bg-sky-50/90 px-3 py-2.5 text-sky-950">
        <p className="text-xs font-medium">Распознавание скана…</p>
        <p className="mt-0.5 text-[11px] leading-relaxed opacity-90">
          В PDF мало текстового слоя. Идёт OCR через GigaChat — просмотр страниц уже доступен.
        </p>
        {ocrProgress && ocrProgress.pagesTotal > 0 && ocrProgress.pagesDone > 0 && (
          <p className="mt-1 text-[11px] font-medium tabular-nums opacity-90">
            Обработано страниц: {ocrProgress.pagesDone} / {ocrProgress.pagesTotal}
          </p>
        )}
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className="relative mb-2 shrink-0 rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2.5 text-amber-950">
        {onDismiss && (
          <button
            type="button"
            title="Скрыть"
            aria-label="Скрыть"
            onClick={onDismiss}
            className="absolute right-1.5 top-1.5 flex h-7 w-7 cursor-pointer items-center justify-center rounded text-lg text-current/40 hover:bg-white/60 hover:text-current/70"
          >
            ✕
          </button>
        )}
        <p className="pr-6 text-xs font-medium">Скан: текст распознать не удалось</p>
        <p className="mt-0.5 text-[11px] leading-relaxed opacity-90">{TEXTLESS_SCAN_REASON}</p>
        {ocrError && <p className="mt-1 text-[11px] opacity-80">Причина: {ocrError}</p>}
        {canRunOcr ? (
          <OcrButton
            onRunOcr={onRunOcr}
            ocrRunning={ocrRunning}
            progress={ocrProgress}
            label="Распознать заново"
          />
        ) : (
          <p className="mt-1 text-[11px] opacity-80">
            {runOcrUnavailableReason ??
              'Автоматическое распознавание недоступно: не настроен провайдер GigaChat.'}
          </p>
        )}
      </div>
    );
  }

  if (status === 'skipped') {
    return (
      <div className="relative mb-2 shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-800">
        {onDismiss && (
          <button
            type="button"
            title="Скрыть"
            aria-label="Скрыть"
            onClick={onDismiss}
            className="absolute right-1.5 top-1.5 flex h-7 w-7 cursor-pointer items-center justify-center rounded text-lg text-current/40 hover:bg-white/60 hover:text-current/70"
          >
            ✕
          </button>
        )}
        <p className="pr-6 text-xs font-medium">Скан: текстового слоя нет</p>
        <p className="mt-0.5 text-[11px] leading-relaxed opacity-90">{TEXTLESS_SCAN_REASON}</p>
        {canRunOcr ? (
          <OcrButton
            onRunOcr={onRunOcr}
            ocrRunning={ocrRunning}
            progress={ocrProgress}
            label="Распознать текст"
          />
        ) : (
          <p className="mt-1 text-[11px] opacity-80">
            {runOcrUnavailableReason ??
              'Для распознавания нужен провайдер GigaChat. Загрузите PDF с текстовым слоем.'}
          </p>
        )}
      </div>
    );
  }

  return null;
}
