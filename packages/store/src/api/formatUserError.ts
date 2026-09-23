export const MSG_NO_CONNECTION = 'Отсутствует соединение. Проверьте интернет или попробуйте позже.';
export const MSG_SERVICE_UNAVAILABLE =
  'Сервис временно недоступен. Попробуйте позже. Ошибка будет повторена автоматически.';
export const MSG_GENERIC_ERROR = 'Не удалось выполнить операцию. Попробуйте ещё раз.';
export const MSG_AI_NOT_CONFIGURED =
  'ИИ-сервис не настроен или ключ доступа недействителен. Сообщите администратору.';
export const MSG_JOB_NOT_FOUND = 'Задание не найдено. Попробуйте ещё раз.';
export const MSG_DOCUMENT_NOT_FOUND =
  'Документ не найден. Возможно, он был удалён или у вас нет доступа.';

const NETWORK_PATTERN =
  /fetch failed|failed to fetch|networkerror|network error|econnrefused|econnreset|ehostunreach|enetunreach|enetdown|etimedout|timeout|timed out|socket hang up|socket closed|connection (is )?closed|input\/output error|typeerror|FETCH_ERROR|TIMEOUT_ERROR|PARSING_ERROR|ERR_CONNECTION|ERR_NETWORK|Redis|redis/i;

const CREDENTIALS_PATTERN =
  /credentials?.*(not configured|не настроен)|api[ -]?key|iam.?token|\b401\b|unauthorized|badauth|authorization.*(fail|invalid)/i;

const S3_PATTERN = /s3 is not configured|s3 not configured|\bs3\b.*not configured/i;
const S3_OBJECT_NOT_FOUND_PATTERN = /s3 object not found/i;
const GOTENBERG_PATTERN = /gotenberg/i;
const PDF2DOCX_PATTERN = /pdf.{0,3}(to|→|->).{0,3}docx|pdf.?2.?docx/i;
const TARGET_VERSION_DELETED_PATTERN = /target version.*(deleted|not found)/i;
const JOB_NOT_FOUND_PATTERN = /job not found|job: .*missing|missing jobid|job .* no longer/i;
const DOCUMENT_NOT_FOUND_PATTERN = /document not found|document does not exist/i;
const OUT_OF_RANGE_PATTERN = /out of range|больш[ее] числа страниц/i;
const PAYLOAD_LARGE_PATTERN = /payload too large/i;
const JSON_PATTERN =
  /invalid json|unexpected (token|end|character)|unexpected end of json|json.*(parse|valid|format)|expected.*json|не в формате json|валидным json|invalid.*json|response.*not.*json|json.*object/i;
const API_ERROR_PATTERN =
  /api error|responsestatus|http \d{3}|status \d{3}|axios|max retries|retry/i;
const NOT_CONFIGURED_PATTERN = /not configured|не настроен/i;
const VALIDATION_PATTERN = /must be at least|validation error|invalid (request|body|input)|zod/i;

export function extractErrorText(err: unknown): string | undefined {
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  if (!err || typeof err !== 'object') return undefined;
  const record = err as Record<string, unknown>;
  const data = record.data;
  if (typeof data === 'string' && data.trim()) return data;
  if (data && typeof data === 'object') {
    const error = (data as Record<string, unknown>).error;
    if (typeof error === 'string' && error.trim()) return error;
    const message = (data as Record<string, unknown>).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  if (typeof record.error === 'string' && record.error.trim()) return record.error;
  if (typeof record.message === 'string' && record.message.trim()) return record.message;
  return undefined;
}

export function extractErrorStatus(err: unknown): number | string | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const status = (err as Record<string, unknown>).status;
  return typeof status === 'number' || typeof status === 'string' ? status : undefined;
}

export function formatUserError(text: unknown, status?: number | string): string {
  const raw = typeof text === 'string' ? text.trim() : text != null ? String(text).trim() : '';
  if (!raw || /^(undefined|null|nan|\[object )/i.test(raw)) {
    if (typeof status === 'number' && status >= 500) return MSG_SERVICE_UNAVAILABLE;
    return MSG_GENERIC_ERROR;
  }
  if (status === 401 || status === 403) return MSG_AI_NOT_CONFIGURED;
  if (/[а-яёА-ЯЁ]/.test(raw)) return raw;
  if (NETWORK_PATTERN.test(raw)) return MSG_NO_CONNECTION;
  if (CREDENTIALS_PATTERN.test(raw)) return MSG_AI_NOT_CONFIGURED;
  if (S3_PATTERN.test(raw)) return 'Файловое хранилище не настроено. Сообщите администратору.';
  if (S3_OBJECT_NOT_FOUND_PATTERN.test(raw)) return 'Файл не найден в хранилище.';
  if (GOTENBERG_PATTERN.test(raw))
    return 'Не удалось сконвертировать документ. Попробуйте ещё раз.';
  if (PDF2DOCX_PATTERN.test(raw)) return 'Конвертация в DOCX не удалась. Попробуйте ещё раз.';
  if (TARGET_VERSION_DELETED_PATTERN.test(raw))
    return 'Целевая версия была удалена. Создайте новую.';
  if (JOB_NOT_FOUND_PATTERN.test(raw)) return MSG_JOB_NOT_FOUND;
  if (DOCUMENT_NOT_FOUND_PATTERN.test(raw)) return MSG_DOCUMENT_NOT_FOUND;
  if (OUT_OF_RANGE_PATTERN.test(raw)) return 'Номер страницы выходит за пределы документа.';
  if (PAYLOAD_LARGE_PATTERN.test(raw))
    return 'Файл слишком большой для отправки. Уменьшите размер или удалите лишнее.';
  if (JSON_PATTERN.test(raw)) return 'Сервис вернул некорректный ответ. Попробуйте ещё раз.';
  if (API_ERROR_PATTERN.test(raw)) return MSG_SERVICE_UNAVAILABLE;
  if (NOT_CONFIGURED_PATTERN.test(raw)) return MSG_AI_NOT_CONFIGURED;
  if (VALIDATION_PATTERN.test(raw)) return 'Проверьте корректность введённых данных.';
  if (typeof status === 'number' && status >= 500) return MSG_SERVICE_UNAVAILABLE;
  if (raw.length > 120 || /[{}[\]\\]/.test(raw) || /[_-]{3,}/.test(raw)) return MSG_GENERIC_ERROR;
  return raw;
}

export function toUserErrorMessage(err: unknown, fallback: string = MSG_GENERIC_ERROR): string {
  const text = extractErrorText(err);
  if (!text) return fallback;
  return formatUserError(text, extractErrorStatus(err));
}
