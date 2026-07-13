import { afterEach, describe, expect, it, vi } from 'vitest';
import { promises as dns } from 'node:dns';
import {
  validateEmailDomainRules,
  validateEmailFormat,
  validateEmailMx,
} from './email-validation.js';

vi.mock('node:dns', () => ({
  promises: {
    resolveMx: vi.fn(),
    resolve4: vi.fn(),
    resolve6: vi.fn(),
  },
}));

const resolveMx = vi.mocked(dns.resolveMx);
const resolve4 = vi.mocked(dns.resolve4);
const resolve6 = vi.mocked(dns.resolve6);

describe('email validation', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('rejects invalid format', () => {
    expect(validateEmailFormat('not-an-email')?.code).toBe('INVALID_FORMAT');
  });

  it('rejects disposable domains', () => {
    expect(validateEmailDomainRules('user@mailinator.com')?.code).toBe('DISPOSABLE_EMAIL');
  });

  it('suggests domain typo', () => {
    expect(validateEmailDomainRules('user@gmial.com')?.code).toBe('DOMAIN_TYPO');
  });

  it('accepts domain with MX records', async () => {
    resolveMx.mockResolvedValue([{ exchange: 'mx.example.com', priority: 10 }]);
    await expect(validateEmailMx('user@marksgroup.ru')).resolves.toBeNull();
  });

  it('accepts domain via implicit MX (A record) when MX lookup times out', async () => {
    const timeoutErr = Object.assign(new Error('timeout'), { code: 'ETIMEOUT' });
    resolveMx.mockRejectedValue(timeoutErr);
    resolve4.mockResolvedValue(['91.186.198.87']);
    resolve6.mockResolvedValue([]);

    await expect(validateEmailMx('user@marksgroup.ru')).resolves.toBeNull();
  });

  it('rejects unknown domain', async () => {
    const notFoundErr = Object.assign(new Error('not found'), { code: 'ENOTFOUND' });
    resolveMx.mockRejectedValue(notFoundErr);

    const result = await validateEmailMx('user@no-such-domain-xyz.invalid');
    expect(result?.code).toBe('NO_MX');
  });
});
