export const LABEL_ARCHIVE_PDF = 'Архивный PDF (PDF/A)';
export const LABEL_ARCHIVE_PDF_HINT =
  'Формат для долгого хранения и передачи в архив. Если конвертация недоступна на сервере организации, в пакет попадёт обычный PDF — качество просмотра не изменится.';

export const MSG_ARCHIVE_PDF_FALLBACK =
  'Пакет готов к отправке. Архивный формат PDF/A на сервере не получился — в ZIP обычный PDF. Для просмотра и печати это нормально. Если заказчик требует именно PDF/A — сообщите администратору.';

export const MSG_PROCESSING = 'Идёт подготовка на сервере…';
export const MSG_PROCESSING_WAIT = 'Идёт обработка, подождите…';
export const MSG_NETWORK_STORAGE = 'Не удалось связаться с хранилищем. Проверьте интернет или обратитесь к администратору.';

/** Короткая подпись статуса версии в списках. */
export const VERSION_STATUS_LABELS = {
  pending_upload: 'не загружен',
  processing: 'идёт обработка',
  ready: 'готов',
  failed: 'ошибка',
} as const;

/** В списке документов: версию уже можно открыть, пока догружаются миниатюры. */
export const MSG_VERSION_VIEWABLE_WHILE_PROCESSING = 'можно смотреть';

export function getVersionStatusLabel(status: string): string {
  return VERSION_STATUS_LABELS[status as keyof typeof VERSION_STATUS_LABELS] ?? status;
}

export function getVersionListStatusLabel(status: string): string {
  if (status === 'processing') return MSG_VERSION_VIEWABLE_WHILE_PROCESSING;
  return getVersionStatusLabel(status);
}

export function formatProcessingWaitMessage(detail?: string | null): string {
  if (!detail?.trim()) return MSG_PROCESSING_WAIT;
  const trimmed = detail.trim();
  if (trimmed.endsWith('…') || trimmed.endsWith('...')) {
    return `${trimmed} Подождите…`;
  }
  return `${trimmed}. ${MSG_PROCESSING_WAIT}`;
}

export function msgNewVersionStarted(version: number): string {
  return formatProcessingWaitMessage(`Создана версия ${version}`);
}

export const HINT_OPTIMIZE_NEW_VERSION =
  'Создаст уменьшенную копию файла и добавит её новой строкой в списке версий слева.';
export const HINT_OPTIMIZE_REQUIREMENTS = 'Нужна готовая версия документа (до 200 страниц).';
export const HINT_LAYOUT_SAVE_NEW_VERSION =
  'Все картинки и фигуры из черновика будут встроены в копию PDF. Новая версия появится в списке слева — как после сжатия или объединения.';

export const MSG_OPERATION_STARTING = formatProcessingWaitMessage('Запускаем операцию');
export const MSG_OPTIMIZE_RUNNING = formatProcessingWaitMessage('Сжимаем PDF');
export const MSG_OPTIMIZE_DONE_SUFFIX = 'Файл открыт в просмотрщике, картинки страниц подгружаются.';
export const MSG_OPTIMIZE_NO_CHANGE = 'Размер почти не изменился — файл уже достаточно компактный.';
export const MSG_OPTIMIZE_NO_TOOLS =
  'Размер не изменился. Сообщите администратору — на сервере не настроено сжатие PDF.';
export const MSG_OPTIMIZE_SAVED = (savedPct: number) =>
  `Размер уменьшен примерно на ${savedPct}%`;
export const MSG_OPTIMIZE_ASSEMBLED = 'Новая версия собрана без уменьшения размера';

export function formatOptimizeWaitHint(sourceBytes: number): string | null {
  if (!Number.isFinite(sourceBytes) || sourceBytes < 8 * 1024 * 1024) return null;
  const mb = sourceBytes / (1024 * 1024);
  return `Файл около ${mb < 10 ? mb.toFixed(1) : Math.round(mb)} МБ — сжатие может занять несколько минут. Не закрывайте вкладку.`;
}

export function readJobProgressLabel(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null || !('progress' in payload)) return null;
  const progress = (payload as { progress?: unknown }).progress;
  if (typeof progress !== 'object' || progress === null || !('label' in progress)) return null;
  const label = (progress as { label?: unknown }).label;
  if (typeof label !== 'string' || !label.trim()) return null;
  const step = (progress as { step?: unknown }).step;
  const total = (progress as { total?: unknown }).total;
  if (typeof step === 'number' && typeof total === 'number' && total > 0) {
    return formatProcessingWaitMessage(`${label} (${step} из ${total})`);
  }
  return formatProcessingWaitMessage(label);
}

export const LABEL_GUEST_BOOKLET_ZIP = 'Скачивание пакета (ZIP)';
export const LABEL_GUEST_BOOKLET_ZIP_HINT =
  'Заказчик сможет скачать ZIP с PDF и JPG страниц по этой же ссылке. Сначала соберите пакет в разделе «Буклет».';

export const LABEL_PAGE_REVIEW_SECTION = 'Пометки по страницам';
export const HINT_PAGE_REVIEW_AUTHOR =
  'Отметьте страницу, пока листаете документ. «Нужны правки» заказчик увидит по ссылке — баннер на превью. «ОК» видите только вы и команда.';

export const LABEL_PAGE_REVIEW_OK = 'ОК';
export const LABEL_PAGE_REVIEW_NEEDS_FIX = 'Нужны правки';

export const LABEL_GUEST_PAGE_NEEDS_FIX = 'Нужны правки';
export const LABEL_GUEST_PAGE_OK = 'Проверено отправителем';
export const MSG_GUEST_PAGE_NEEDS_FIX =
  'Отправитель просит обратить внимание на эту страницу. Оставьте замечание ниже или свяжитесь с ним напрямую.';

export const LABEL_GUEST_COMMENT_OPEN = 'Открыто';
export const LABEL_GUEST_COMMENT_RESOLVED = 'Исправлено';
export const LABEL_GUEST_COMMENT_RESOLVED_GUEST = 'Исправлено отправителем';
export const LABEL_GUEST_AUTHOR_REPLY = 'Ответ отправителя';
export const HINT_GUEST_RESOLVE_REPLY =
  'Необязательно. Заказчик увидит этот текст по гостевой ссылке.';
export const MSG_GUEST_COMMENT_RESOLVED_AUTHOR =
  'Замечание закрыто. Заказчик увидит статус «Исправлено» по ссылке — метка на PDF скрыта.';
export const PLACEHOLDER_GUEST_RESOLVE_REPLY =
  'Например: картинку на этой странице заменили, проверьте';
