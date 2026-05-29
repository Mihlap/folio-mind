const TYPO_TO_CORRECT: Record<string, string> = {
  'gmial.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gmil.com': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gmail.con': 'gmail.com',
  'gnail.com': 'gmail.com',
  'yaho.com': 'yahoo.com',
  'yahooo.com': 'yahoo.com',
  'hotmial.com': 'hotmail.com',
  'hotmal.com': 'hotmail.com',
  'outlok.com': 'outlook.com',
  'outllok.com': 'outlook.com',
  'mail.ruu': 'mail.ru',
  'mai.ru': 'mail.ru',
  'yndex.ru': 'yandex.ru',
};

export function suggestEmailDomainFix(domain: string): string | null {
  const d = domain.toLowerCase();
  return TYPO_TO_CORRECT[d] ?? null;
}
