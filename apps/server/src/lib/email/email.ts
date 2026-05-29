export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function emailDomain(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 1) return '';
  return email.slice(at + 1);
}
