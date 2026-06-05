type Props = {
  x: number;
  y: number;
  previewText: string;
  onUseAsQuote: () => void;
  onDismiss: () => void;
};

function truncatePreview(text: string, max = 72): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1)}…`;
}

export function PdfTextSelectionPrompt({ x, y, previewText, onUseAsQuote, onDismiss }: Props) {
  const preview = truncatePreview(previewText);

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[55] cursor-default"
        aria-label="Закрыть"
        onClick={onDismiss}
      />
      <div
        className="fixed z-[56] flex max-w-[min(90vw,20rem)] flex-col gap-1.5 rounded-lg border border-slate-200 bg-white p-2 shadow-lg"
        style={{ left: Math.max(8, x), top: Math.max(8, y) }}
        role="dialog"
        aria-label="Выделенный текст"
        data-pdf-selection-ui=""
      >
        {preview && (
          <p
            className="line-clamp-2 border-b border-slate-100 px-1 pb-1.5 text-[11px] leading-snug text-slate-600"
            title={previewText}
          >
            «{preview}»
          </p>
        )}
        <button
          type="button"
          onClick={onUseAsQuote}
          className="cursor-pointer whitespace-nowrap rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-900 hover:bg-red-100"
        >
          В правку «было»
        </button>
      </div>
    </>
  );
}
