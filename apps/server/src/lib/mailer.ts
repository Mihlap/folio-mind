import nodemailer from 'nodemailer';
import type { Env } from './env.js';

export type Mailer = {
  sendPasswordResetEmail(params: { to: string; resetUrl: string }): Promise<void>;
};

function isSmtpConfigured(env: Env): boolean {
  const host = env.SMTP_HOST?.trim();
  if (!host || !env.SMTP_PORT || !env.SMTP_FROM) return false;
  if (host.includes('@')) {
    throw new Error('SMTP_HOST должен быть smtp.mail.ru, а не адрес почты');
  }
  return true;
}

export function createMailer(env: Env, logger: { info: Function; warn: Function }): Mailer {
  if (!isSmtpConfigured(env)) {
    return {
      async sendPasswordResetEmail({ to, resetUrl }) {
        logger.warn(
          { to, resetUrl },
          'SMTP is not configured; printing password reset link instead of sending email',
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
  };
}

