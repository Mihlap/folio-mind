import nodemailer from 'nodemailer';
import type { Env } from '../config/env.js';
export type Mailer = {
  sendPasswordResetEmail(params: { to: string; resetUrl: string }): Promise<void>;
  sendEmailVerification(params: { to: string; verifyUrl: string }): Promise<void>;
  sendMagicLinkEmail(params: { to: string; magicUrl: string }): Promise<void>;
};
function isSmtpConfigured(env: Env): boolean {
  const host = env.SMTP_HOST?.trim();
  if (!host || !env.SMTP_PORT || !env.SMTP_FROM) return false;
  if (host.includes('@')) {
    throw new Error('SMTP_HOST должен быть smtp.mail.ru, а не адрес почты');
  }
  return true;
}
export function createMailer(
  env: Env,
  logger: {
    info: Function;
    warn: Function;
  },
): Mailer {
  if (!isSmtpConfigured(env)) {
    return {
      async sendPasswordResetEmail({ to, resetUrl }) {
        logger.warn(
          { to, resetUrl },
          'SMTP is not configured; printing password reset link instead of sending email',
        );
      },
      async sendEmailVerification({ to, verifyUrl }) {
        logger.warn(
          { to, verifyUrl },
          'SMTP is not configured; printing email verification link instead of sending email',
        );
      },
      async sendMagicLinkEmail({ to, magicUrl }) {
        logger.warn(
          { to, magicUrl },
          'SMTP is not configured; printing magic link instead of sending email',
        );
      },
    };
  }
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD ?? '' } : undefined,
  });
  return {
    async sendPasswordResetEmail({ to, resetUrl }) {
      const subject = 'Сброс пароля — РазУм';
      const text = `Вы запросили сброс пароля.\n\nОткройте ссылку, чтобы задать новый пароль:\n${resetUrl}\n\nЕсли вы не запрашивали сброс, просто игнорируйте это письмо.`;
      await transporter.sendMail({
        from: env.SMTP_FROM,
        to,
        subject,
        text,
        html: `
<p>Вы запросили сброс пароля.</p>
<p><a href="${resetUrl}">Сбросить пароль</a></p>
<p style="color:#64748b;font-size:12px;">Если вы не запрашивали сброс, просто игнорируйте это письмо.</p>
`.trim(),
      });
      logger.info({ to }, 'password reset email sent');
    },
    async sendEmailVerification({ to, verifyUrl }) {
      const subject = 'Подтвердите email — РазУм';
      const text = `Подтвердите адрес почты, чтобы войти в РазУм:\n${verifyUrl}\n\nЕсли вы не регистрировались, проигнорируйте письмо.`;
      await transporter.sendMail({
        from: env.SMTP_FROM,
        to,
        subject,
        text,
        html: `
<p>Подтвердите адрес почты, чтобы завершить регистрацию в РазУм.</p>
<p><a href="${verifyUrl}">Подтвердить email</a></p>
<p style="color:#64748b;font-size:12px;">Если вы не регистрировались, проигнорируйте это письмо.</p>
`.trim(),
      });
      logger.info({ to }, 'email verification sent');
    },
    async sendMagicLinkEmail({ to, magicUrl }) {
      const subject = 'Вход в РазУм — ссылка для входа';
      const text = `Войдите в РазУм по ссылке:\n${magicUrl}\n\nСсылка действует ограниченное время. Если вы не запрашивали вход, проигнорируйте письмо.`;
      await transporter.sendMail({
        from: env.SMTP_FROM,
        to,
        subject,
        text,
        html: `
<p>Войдите в РазУм по одноразовой ссылке:</p>
<p><a href="${magicUrl}">Войти в аккаунт</a></p>
<p style="color:#64748b;font-size:12px;">Ссылка действует ограниченное время.</p>
`.trim(),
      });
      logger.info({ to }, 'magic link email sent');
    },
  };
}
