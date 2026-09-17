export type PdfActionHintKind = 'text-selection' | 'layout';

type Props = {
  kind: PdfActionHintKind;
  onOpenTools: () => void;
  onDismiss: () => void;
};

export function PdfActionHintBanner({ kind, onOpenTools, onDismiss }: Props) {
  const title = kind === 'text-selection' ? 'Выделите текст на странице' : 'Режим макета активен';
  const description =
    kind === 'text-selection'
      ? 'Поле «Было» заполнится автоматически. Вернитесь в инструменты, когда выделите фрагмент.'
      : 'Добавьте изображения из медиатеки или из файлов. Вернитесь в инструменты для настроек.';
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-2 z-20 flex justify-center px-2 md:hidden">
      <div className="pointer-events-auto flex w-full max-w-sm items-center gap-2.5 rounded-xl border border-slate-200 bg-white/95 px-3 py-2.5 shadow-lg backdrop-blur">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-folio-100 text-[15px] font-bold text-folio-700"
          aria-hidden
        >
          {kind === 'text-selection' ? '✂' : '▦'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-slate-800">{title}</p>
          <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{description}</p>
        </div>
        <button
          type="button"
          onClick={onOpenTools}
          className="shrink-0 cursor-pointer rounded-lg bg-folio-600 px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-folio-700"
        >
          Инструменты
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Скрыть подсказку"
          className="shrink-0 cursor-pointer rounded-md p-1 text-base leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          ✕
        </button>
      </div>
    </div>
  );
}