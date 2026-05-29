import { describe, expect, it } from 'vitest';
import {
  validateEmailDomainRules,
  validateEmailFormat,
} from './email-validation.js';

describe('email validation', () => {
  it('rejects invalid format', () => {
    expect(validateEmailFormat('not-an-email')?.code).toBe('INVALID_FORMAT');
  });

  it('rejects disposable domains', () => {
    expect(validateEmailDomainRules('user@mailinator.com')?.code).toBe('DISPOSABLE_EMAIL');
  });

  it('suggests domain typo', () => {
    expect(validateEmailDomainRules('user@gmial.com')?.code).toBe('DOMAIN_TYPO');
  });
});
