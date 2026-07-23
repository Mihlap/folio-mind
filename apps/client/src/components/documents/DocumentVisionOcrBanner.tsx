type Props = {
  status: string | null | undefined;
  textSource?: string | null;
  onDismiss?: () => void;
};

export function DocumentVisionOcrBanner({ status, textSource, onDismiss }: Props) {
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
          Превью не блокировалось. Чат и сверка используют распознанный текст.
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
        <p className="pr-6 text-xs font-medium">Не удалось распознать скан</p>
        <p className="mt-0.5 text-[11px] leading-relaxed opacity-90">
          Чат и ИИ могут работать хуже на этом файле. Загрузите PDF с текстовым слоем или повторите
          позже.
        </p>
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
        <p className="pr-6 text-xs font-medium">Скан без OCR</p>
        <p className="mt-0.5 text-[11px] leading-relaxed opacity-90">
          Для автораспознавания нужен провайдер GigaChat. Сейчас доступен текстовый слой pdf.js (если
          был).
        </p>
      </div>
    );
  }

  return null;
}
