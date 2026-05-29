import { promises as dns } from 'node:dns';
import { emailDomain, normalizeEmail } from './email.js';
import { isDisposableEmailDomain } from './disposable-domains.js';
import { suggestEmailDomainFix } from './domain-typos.js';

export type EmailValidationError = {
  code:
    | 'INVALID_FORMAT'
    | 'DISPOSABLE_EMAIL'
    | 'DOMAIN_TYPO'
    | 'NO_MX'
    | 'MX_LOOKUP_FAILED';
  message: string;
};

const EMAIL_FORMAT =
  /^[a-z0-9](?:[a-z0-9._%+-]*[a-z0-9])?@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;

export function validateEmailFormat(normalized: string): EmailValidationError | null {
  if (!EMAIL_FORMAT.test(normalized)) {
    return {
      code: 'INVALID_FORMAT',
      message: 'Некорректный email. Проверьте адрес и домен.',
    };
  }
  return null;
}

export function validateEmailDomainRules(normalized: string): EmailValidationError | null {
  const domain = emailDomain(normalized);
  if (!domain) {
    return { code: 'INVALID_FORMAT', message: 'Некорректный email.' };
  }

  if (isDisposableEmailDomain(domain)) {
    return {
      code: 'DISPOSABLE_EMAIL',
      message: 'Временные почтовые ящики не поддерживаются. Укажите постоянный email.',
    };
  }

  const suggestion = suggestEmailDomainFix(domain);
  if (suggestion) {
    return {
      code: 'DOMAIN_TYPO',
      message: `Возможно, вы имели в виду @${suggestion}?`,
    };
  }

  return null;
}

export async function validateEmailMx(
  normalized: string,
  options?: { skipMx?: boolean },
): Promise<EmailValidationError | null> {
  if (options?.skipMx) return null;

  const domain = emailDomain(normalized);
  if (!domain) return { code: 'INVALID_FORMAT', message: 'Некорректный email.' };

  try {
    const mx = await dns.resolveMx(domain);
    if (!mx || mx.length === 0) {
      return {
        code: 'NO_MX',
        message: 'Домен почты не принимает письма. Проверьте адрес.',
      };
    }
    return null;
  } catch (err: unknown) {
    const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : '';
    if (code === 'ENODATA' || code === 'ENOTFOUND') {
      return {
        code: 'NO_MX',
        message: 'Домен почты не найден. Проверьте написание.',
      };
    }
    return {
      code: 'MX_LOOKUP_FAILED',
      message: 'Не удалось проверить домен почты. Попробуйте позже.',
    };
  }
}

export async function validateEmailForRegistration(
  rawEmail: string,
  options?: { skipMx?: boolean },
): Promise<{ email: string } | { error: EmailValidationError }> {
  const email = normalizeEmail(rawEmail);
  const formatErr = validateEmailFormat(email);
  if (formatErr) return { error: formatErr };

  const domainErr = validateEmailDomainRules(email);
  if (domainErr) return { error: domainErr };

  const mxErr = await validateEmailMx(email, options);
  if (mxErr) return { error: mxErr };

  return { email };
}
