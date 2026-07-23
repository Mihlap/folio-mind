import nodemailer from 'nodemailer';
import type { Env } from '../config/env.js';

export type Mailer = {
  sendPasswordResetEmail(params: { to: string; resetUrl: string }): Promise<void>;
  sendEmailVerification(params: {
    to: string;
    verifyUrl: string;
    verifyUrlEmulator?: string | null;
  }): Promise<void>;
  sendMagicLinkEmail(params: { to: string; magicUrl: string }): Promise<void>;
  sendGuestCommentNotification(params: {
    to: string;
    ownerName?: string | null;
    documentTitle: string;
    versionNumber: number;
    authorName: string;
    page: number;
    contentPreview: string;
    documentUrl: string;
  }): Promise<void>;
  sendGuestCommentResolvedNotification(params: {
    to: string;
    guestName?: string | null;
    documentTitle: string;
    versionNumber: number;
    page: number;
    authorReply: string;
  }): Promise<void>;
};

const DEFAULT_FROM_NAME = 'РазУм';

/** From как объект — nodemailer кодирует кириллицу в RFC 2047 (иначе в Mail.ru «Р°Р·РЈРј»). */
export function resolveSmtpFrom(rawFrom: string, fromName?: string): { name: string; address: string } {
  const trimmed = rawFrom.trim().replace(/^["']|["']$/g, '');
  const angled = trimmed.match(/^(.*?)\s*<([^>]+)>\s*$/);
  const address = (angled ? angled[2]! : trimmed).trim();
  const nameFromEnv = fromName?.trim();
  const name =
    nameFromEnv && nameFromEnv.length > 0
      ? nameFromEnv
      : DEFAULT_FROM_NAME;
  return { name, address };
}

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
    info: (obj: unknown, msg?: string) => void;
    warn: (obj: unknown, msg?: string) => void;
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
      async sendEmailVerification({ to, verifyUrl, verifyUrlEmulator }) {
        logger.warn(
          { to, verifyUrl, verifyUrlEmulator: verifyUrlEmulator ?? undefined },
          'SMTP is not configured; printing email verification link instead of sending email',
        );
      },
      async sendMagicLinkEmail({ to, magicUrl }) {
        logger.warn(
          { to, magicUrl },
          'SMTP is not configured; printing magic link instead of sending email',
        );
      },
      async sendGuestCommentNotification({
        to,
        documentTitle,
        versionNumber,
        authorName,
        page,
        contentPreview,
        documentUrl,
      }) {
        logger.warn(
          {
            to,
            documentTitle,
            versionNumber,
            authorName,
            page,
            contentPreview,
            documentUrl,
          },
          'SMTP is not configured; guest comment notification (dev log)',
        );
      },
      async sendGuestCommentResolvedNotification({
        to,
        documentTitle,
        versionNumber,
        page,
        authorReply,
      }) {
        logger.warn(
          {
            to,
            documentTitle,
            versionNumber,
            page,
            authorReply,
          },
          'SMTP is not configured; guest comment resolved notification (dev log)',
        );
      },
    };
  }

  const from = resolveSmtpFrom(env.SMTP_FROM!, env.SMTP_FROM_NAME);
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
        from,
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
    async sendEmailVerification({ to, verifyUrl, verifyUrlEmulator }) {
      const subject = 'Подтвердите email — РазУм';
      const emulatorBlock = verifyUrlEmulator
        ? `\n\nAndroid-эмулятор (если ПК-ссылка не открывается с AVD):\n${verifyUrlEmulator}`
        : '';
      const text = `Подтвердите адрес почты, чтобы войти в РазУм:\n${verifyUrl}${emulatorBlock}\n\nЕсли вы не регистрировались, проигнорируйте письмо.`;
      const emulatorHtml = verifyUrlEmulator
        ? `<p style="margin-top:12px;"><a href="${verifyUrlEmulator}">Подтвердить email (Android-эмулятор)</a></p>
<p style="color:#64748b;font-size:12px;">Вторая ссылка — через 10.0.2.2, если тестируете APK на эмуляторе.</p>`
        : '';
      await transporter.sendMail({
        from,
        to,
        subject,
        text,
        html: `
<p>Подтвердите адрес почты, чтобы завершить регистрацию в РазУм.</p>
<p><a href="${verifyUrl}">Подтвердить email</a></p>
${emulatorHtml}
<p style="color:#64748b;font-size:12px;">Если вы не регистрировались, проигнорируйте это письмо.</p>
`.trim(),
      });
      logger.info({ to }, 'email verification sent');
    },
    async sendMagicLinkEmail({ to, magicUrl }) {
      const subject = 'Вход в РазУм — ссылка для входа';
      const text = `Войдите в РазУм по ссылке:\n${magicUrl}\n\nСсылка действует ограниченное время. Если вы не запрашивали вход, проигнорируйте письмо.`;
      await transporter.sendMail({
        from,
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
    async sendGuestCommentNotification({
      to,
      ownerName,
      documentTitle,
      versionNumber,
      authorName,
      page,
      contentPreview,
      documentUrl,
    }) {
      const greeting = ownerName?.trim() ? `Здравствуйте, ${ownerName.trim()}!` : 'Здравствуйте!';
      const subject = `Новое замечание: «${documentTitle}»`;
      const text = [
        greeting,
        '',
        `Заказчик (${authorName}) оставил замечание к документу «${documentTitle}», версия ${versionNumber}, стр. ${page}:`,
        '',
        contentPreview,
        '',
        `Открыть документ: ${documentUrl}`,
      ].join('\n');
      const html = `
<p>${escapeHtml(greeting)}</p>
<p>Заказчик <strong>${escapeHtml(authorName)}</strong> оставил замечание к документу «${escapeHtml(documentTitle)}» (версия ${versionNumber}, стр. ${page}):</p>
<blockquote style="margin:12px 0;padding:12px;border-left:3px solid #cbd5e1;background:#f8fafc;color:#334155;white-space:pre-wrap;">${escapeHtml(contentPreview)}</blockquote>
<p><a href="${escapeHtml(documentUrl)}">Открыть документ в РазУм</a></p>
<p style="color:#64748b;font-size:12px;">Вы получили это письмо, потому что являетесь владельцем документа.</p>
`.trim();
      await transporter.sendMail({ from, to, subject, text, html });
      logger.info({ to, documentTitle }, 'guest comment notification sent');
    },
    async sendGuestCommentResolvedNotification({
      to,
      guestName,
      documentTitle,
      versionNumber,
      page,
      authorReply,
    }) {
      const greeting = guestName?.trim() ? `Здравствуйте, ${guestName.trim()}!` : 'Здравствуйте!';
      const subject = `Ответ по замечанию: «${documentTitle}»`;
      const text = [
        greeting,
        '',
        `По вашему замечанию к документу «${documentTitle}» (версия ${versionNumber}, стр. ${page}) отправитель оставил ответ:`,
        '',
        authorReply,
      ].join('\n');
      const html = `
<p>${escapeHtml(greeting)}</p>
<p>По вашему замечанию к документу «${escapeHtml(documentTitle)}» (версия ${versionNumber}, стр. ${page}) отправитель оставил ответ:</p>
<blockquote style="margin:12px 0;padding:12px;border-left:3px solid #86efac;background:#f0fdf4;color:#14532d;white-space:pre-wrap;">${escapeHtml(authorReply)}</blockquote>
<p style="color:#64748b;font-size:12px;">Вы получили это письмо, потому что указали email при отправке замечания.</p>
`.trim();
      await transporter.sendMail({ from, to, subject, text, html });
      logger.info({ to, documentTitle }, 'guest comment resolved notification sent');
    },
  };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
