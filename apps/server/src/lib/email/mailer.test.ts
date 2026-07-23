import { describe, expect, it } from 'vitest';
import { resolveSmtpFrom } from './mailer.js';

describe('resolveSmtpFrom', () => {
  it('uses РазУм as display name by default', () => {
    expect(resolveSmtpFrom('folio_mind@mail.ru')).toEqual({
      name: 'РазУм',
      address: 'folio_mind@mail.ru',
    });
  });

  it('extracts address from Name <email> and ignores broken name in raw', () => {
    expect(resolveSmtpFrom('Р°Р·РЈРј <folio_mind@mail.ru>')).toEqual({
      name: 'РазУм',
      address: 'folio_mind@mail.ru',
    });
  });

  it('prefers SMTP_FROM_NAME', () => {
    expect(resolveSmtpFrom('a@b.ru', 'Folio Mind')).toEqual({
      name: 'Folio Mind',
      address: 'a@b.ru',
    });
  });
});
