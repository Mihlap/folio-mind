const DISPOSABLE = new Set([
  'mailinator.com',
  'guerrillamail.com',
  'guerrillamail.net',
  'sharklasers.com',
  '10minutemail.com',
  'tempmail.com',
  'temp-mail.org',
  'throwaway.email',
  'yopmail.com',
  'trashmail.com',
  'getnada.com',
  'maildrop.cc',
  'dispostable.com',
  'fakeinbox.com',
  'mintemail.com',
  'emailondeck.com',
  'tempail.com',
  'moakt.com',
  'inboxkitten.com',
]);

export function isDisposableEmailDomain(domain: string): boolean {
  const d = domain.toLowerCase();
  if (DISPOSABLE.has(d)) return true;

  for (const blocked of DISPOSABLE) {
    if (d.endsWith(`.${blocked}`)) return true;
  }
  return false;
}
