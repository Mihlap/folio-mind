type DocumentOfflineBannerProps = {
  cachedPages: number;
  savedAt?: number;
};

export function DocumentOfflineBanner({ cachedPages, savedAt }: DocumentOfflineBannerProps) {
  const when =
    savedAt != null
      ? new Date(savedAt).toLocaleString('ru-RU', {
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })
      : null;

  return (
    <div
      className="mx-2 mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 sm:mx-3"
      role="status"
    >
      Нет сети. Показан офлайн-кэш превью ({cachedPages} стр.
      {when ? `, сохранён ${when}` : ''}). Правки и ИИ недоступны, пока не появится соединение.
    </div>
  );
}
