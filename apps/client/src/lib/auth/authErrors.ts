type ApiErrorPayload = {
  error?: string;
  message?: string;
  code?: string;
};
export function getAuthErrorMessage(error: unknown, fallback: string): string {
  if (!error || typeof error !== 'object') return fallback;
  if ('data' in error && error.data && typeof error.data === 'object') {
    const data = error.data as ApiErrorPayload;
    if (data.message) return data.message;
    if (data.error === 'EMAIL_ALREADY_REGISTERED') return 'Этот email уже зарегистрирован';
    if (data.error === 'EMAIL_NOT_VERIFIED') {
      return 'Подтвердите email по ссылке из письма.';
    }
    if (data.error === 'INVALID_FORMAT' || data.code === 'INVALID_FORMAT') {
      return 'Некорректный email. Проверьте адрес.';
    }
    if (data.error === 'DOMAIN_TYPO') return data.message ?? 'Проверьте домен почты';
    if (data.error === 'DISPOSABLE_EMAIL') {
      return 'Временные почтовые ящики не поддерживаются.';
    }
    if (data.error === 'NO_MX') return data.message ?? 'Домен почты не принимает письма';
  }
  if ('status' in error && error.status === 409) {
    return 'Этот email уже зарегистрирован';
  }
  return fallback;
}
export function validatePasswordClient(password: string, confirm: string): string | null {
  if (password.length < 8) return 'Пароль должен быть не короче 8 символов';
  if (!/[a-zа-яё]/.test(password)) return 'Нужна хотя бы одна строчная буква';
  if (!/[A-ZА-ЯЁ]/.test(password)) return 'Нужна хотя бы одна заглавная буква';
  if (!/\d/.test(password)) return 'Нужна хотя бы одна цифра';
  if (password !== confirm) return 'Пароли не совпадают';
  return null;
}
