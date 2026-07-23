const PENDING_VERIFY_EMAIL_KEY = 'folio_pending_verify_email';

export function setPendingVerifyEmail(email: string): void {
  const value = email.trim().toLowerCase();
  if (!value) return;
  try {
    sessionStorage.setItem(PENDING_VERIFY_EMAIL_KEY, value);
    localStorage.setItem(PENDING_VERIFY_EMAIL_KEY, value);
  } catch {
    // ignore quota / private mode
  }
}

export function getPendingVerifyEmail(): string | null {
  try {
    return (
      sessionStorage.getItem(PENDING_VERIFY_EMAIL_KEY) ||
      localStorage.getItem(PENDING_VERIFY_EMAIL_KEY)
    );
  } catch {
    return null;
  }
}

export function clearPendingVerifyEmail(): void {
  try {
    sessionStorage.removeItem(PENDING_VERIFY_EMAIL_KEY);
    localStorage.removeItem(PENDING_VERIFY_EMAIL_KEY);
  } catch {
    // ignore
  }
}
