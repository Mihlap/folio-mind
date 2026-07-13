import { promises as dns } from 'node:dns';
import { emailDomain, normalizeEmail } from './email.js';
import { isDisposableEmailDomain } from './disposable-domains.js';
import { suggestEmailDomainFix } from './domain-typos.js';

export type EmailValidationError = {
  code: 'INVALID_FORMAT' | 'DISPOSABLE_EMAIL' | 'DOMAIN_TYPO' | 'NO_MX' | 'MX_LOOKUP_FAILED';
  message: string;
};

const EMAIL_FORMAT =
  /^[a-z0-9](?:[a-z0-9._%+-]*[a-z0-9])?@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;

const MX_LOOKUP_TIMEOUT_MS = 5_000;
const MX_LOOKUP_RETRIES = 2;
const TRANSIENT_DNS_CODES = new Set(['ETIMEOUT', 'ESERVFAIL', 'ECONNRESET', 'EAI_AGAIN']);

function getDnsErrorCode(err: unknown): string {
  return err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : '';
}

async function withDnsTimeout<T>(promise: Promise<T>, timeoutMs = MX_LOOKUP_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          const err = new Error('DNS lookup timeout') as NodeJS.ErrnoException;
          err.code = 'ETIMEOUT';
          reject(err);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function domainHasImplicitMx(domain: string): Promise<boolean> {
  const [ipv4, ipv6] = await Promise.all([
    withDnsTimeout(dns.resolve4(domain)).catch(() => [] as string[]),
    withDnsTimeout(dns.resolve6(domain)).catch(() => [] as string[]),
  ]);
  return ipv4.length > 0 || ipv6.length > 0;
}

async function domainAcceptsMail(domain: string): Promise<EmailValidationError | null> {
  let lastTransient = false;

  for (let attempt = 0; attempt < MX_LOOKUP_RETRIES; attempt += 1) {
    try {
      const mx = await withDnsTimeout(dns.resolveMx(domain));
      if (mx && mx.length > 0) return null;
      break;
    } catch (err: unknown) {
      const code = getDnsErrorCode(err);
      if (code === 'ENOTFOUND') {
        return {
          code: 'NO_MX',
          message: 'Домен почты не найден. Проверьте написание.',
        };
      }
      if (code === 'ENODATA') {
        break;
      }
      if (TRANSIENT_DNS_CODES.has(code)) {
        lastTransient = true;
        if (attempt + 1 < MX_LOOKUP_RETRIES) continue;
        break;
      }
      return {
        code: 'MX_LOOKUP_FAILED',
        message: 'Не удалось проверить домен почты. Попробуйте позже.',
      };
    }
  }

  if (await domainHasImplicitMx(domain)) {
    return null;
  }

  if (lastTransient) {
    return {
      code: 'MX_LOOKUP_FAILED',
      message: 'Не удалось проверить домен почты. Попробуйте позже.',
    };
  }

  return {
    code: 'NO_MX',
    message: 'Домен почты не принимает письма. Проверьте адрес.',
  };
}

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
  options?: {
    skipMx?: boolean;
  },
): Promise<EmailValidationError | null> {
  if (options?.skipMx) return null;
  const domain = emailDomain(normalized);
  if (!domain) return { code: 'INVALID_FORMAT', message: 'Некорректный email.' };
  return domainAcceptsMail(domain);
}

export async function validateEmailForRegistration(
  rawEmail: string,
  options?: {
    skipMx?: boolean;
  },
): Promise<
  | {
      email: string;
    }
  | {
      error: EmailValidationError;
    }
> {
  const email = normalizeEmail(rawEmail);
  const formatErr = validateEmailFormat(email);
  if (formatErr) return { error: formatErr };
  const domainErr = validateEmailDomainRules(email);
  if (domainErr) return { error: domainErr };
  const mxErr = await validateEmailMx(email, options);
  if (mxErr) return { error: mxErr };
  return { email };
}
