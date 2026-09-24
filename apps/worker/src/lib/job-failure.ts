export type JobFailureCategory =
  | 'edit-text-not-found'
  | 'no-accepted-edits'
  | 'source-unavailable'
  | 'source-corrupt'
  | 'infra-transient'
  | 'infra-not-configured'
  | 'version-deleted'
  | 'unknown';

export type JobFailureClass = {
  category: JobFailureCategory;
  retryable: boolean;
};

const TRANSIENT_PATTERN =
  /fetch failed|networkerror|econnrefused|econnreset|ehostunreach|enetunreach|enetdown|etimedout|timeout|timed out|socket hang up|socket closed|connection (is )?closed|UND_ERR_SOCKET|ECONNRESET|other side closed|aborted/i;

const NOT_CONFIGURED_PATTERN =
  /S3\s+is not configured|S3\s+не настроен|not configured|не настроен|Gotenberg\s+не настроен|сервис PDF.{0,3}DOCX не настроен|PDF.{0,3}DOCX\s+не настроен/i;

const TEXT_NOT_FOUND_PATTERN =
  /не удалось найти текст правок|текст правок не найден|ни одна правка не найдена|text\s+not\s+found/i;

const NO_EDITS_PATTERN = /нет принятых правок|no accepted edits/i;

const VERSION_DELETED_PATTERN = /version\s+(was\s+)?deleted|target version/i;

const CORRUPT_PATTERN = /повреждён|не является DOCX|corrupt|invalid docx/i;

export function classifyJobFailure(err: unknown): JobFailureClass {
  const message = err instanceof Error ? err.message : String(err);
  if (!message || /^(undefined|null|nan|\[object )/i.test(message)) {
    return { category: 'unknown', retryable: false };
  }
  if (TEXT_NOT_FOUND_PATTERN.test(message)) {
    return { category: 'edit-text-not-found', retryable: false };
  }
  if (NO_EDITS_PATTERN.test(message)) {
    return { category: 'no-accepted-edits', retryable: false };
  }
  if (VERSION_DELETED_PATTERN.test(message)) {
    return { category: 'version-deleted', retryable: false };
  }
  if (CORRUPT_PATTERN.test(message)) {
    return { category: 'source-corrupt', retryable: false };
  }
  if (NOT_CONFIGURED_PATTERN.test(message)) {
    return { category: 'infra-not-configured', retryable: false };
  }
  if (TRANSIENT_PATTERN.test(message)) {
    return { category: 'infra-transient', retryable: true };
  }
  if (/S3\s+object\s+not\s+found|файл\s+не\s+найден/i.test(message)) {
    return { category: 'source-unavailable', retryable: false };
  }
  return { category: 'unknown', retryable: false };
}