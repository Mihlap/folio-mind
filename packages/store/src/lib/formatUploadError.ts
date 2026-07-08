export const UPLOAD_NETWORK_ERROR_MESSAGE =
  'Слабое интернет-соединение — файл не загрузился. Повторите позже.';
const NETWORK_HINT =
  /слабое интернет|повторите позже|ECONNRESET|ETIMEDOUT|timeout|socket hang up|Failed to fetch|network error|S3 upload|хранилищ|недоступн|Internal Server Error/i;
export function isUploadNetworkError(err: unknown): boolean {
  if (!err) return false;
  if (typeof err === 'object' && err !== null) {
    const status =
      'status' in err
        ? (
            err as {
              status: unknown;
            }
          ).status
        : undefined;
    if (status === 503 || status === 502 || status === 504 || status === 'FETCH_ERROR') return true;
    const data =
      'data' in err
        ? (
            err as {
              data: unknown;
            }
          ).data
        : undefined;
    if (typeof data === 'string' && NETWORK_HINT.test(data)) return true;
    const error =
      'error' in err
        ? (
            err as {
              error: unknown;
            }
          ).error
        : undefined;
    if (typeof error === 'string' && NETWORK_HINT.test(error)) return true;
    if (error === UPLOAD_NETWORK_ERROR_MESSAGE) return true;
  }
  if (err instanceof Error && NETWORK_HINT.test(err.message)) return true;
  return false;
}
export function formatUploadError(err: unknown, fallback = 'Не удалось загрузить файл'): string {
  if (isUploadNetworkError(err)) return UPLOAD_NETWORK_ERROR_MESSAGE;
  if (err && typeof err === 'object') {
    if (
      'data' in err &&
      typeof (
        err as {
          data: unknown;
        }
      ).data === 'string'
    ) {
      const data = (
        err as {
          data: string;
        }
      ).data.trim();
      if (data) return data;
    }
    if (
      'error' in err &&
      typeof (
        err as {
          error: unknown;
        }
      ).error === 'string'
    ) {
      const message = (
        err as {
          error: string;
        }
      ).error.trim();
      if (message) return message;
    }
  }
  if (err instanceof Error && err.message.trim()) return err.message;
  return fallback;
}
