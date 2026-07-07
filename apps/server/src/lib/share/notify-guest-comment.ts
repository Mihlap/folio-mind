import type { PrismaClient } from '@prisma/client';
import type { Env } from '../config/env.js';
import type { Mailer } from '../email/mailer.js';

export type GuestCommentNotifyPayload = {
  documentId: string;
  documentTitle: string;
  versionId: string;
  versionNumber: number;
  comment: {
    id: string;
    page: number;
    content: string;
    authorName: string | null;
    createdAt: Date;
  };
};

export type GuestCommentResolvedNotifyPayload = {
  guestEmail: string;
  guestName: string | null;
  documentId: string;
  documentTitle: string;
  versionId: string;
  versionNumber: number;
  comment: {
    id: string;
    page: number;
    authorReply: string;
  };
};

function buildDocumentUrl(
  env: Env,
  documentId: string,
  versionId: string,
  commentId: string,
): string {
  const base = env.FRONTEND_URL.replace(/\/+$/, '');
  const qs = new URLSearchParams({ guestComment: commentId, versionId });
  return `${base}/app/documents/${encodeURIComponent(documentId)}?${qs.toString()}`;
}

function excerpt(text: string, maxLen = 400): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen)}…`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

type Logger = {
  info: (obj: object, msg?: string) => void;
  warn: (obj: object, msg?: string) => void;
};

async function postWebhook(env: Env, body: Record<string, unknown>, logger: Logger): Promise<void> {
  const url = env.GUEST_COMMENT_WEBHOOK_URL?.trim();
  if (!url) return;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logger.warn({ status: res.status, body: text.slice(0, 200) }, 'guest comment webhook failed');
      return;
    }
    logger.info({ url }, 'guest comment webhook sent');
  } catch (err) {
    logger.warn({ err }, 'guest comment webhook error');
  } finally {
    clearTimeout(timeout);
  }
}

async function postTelegram(
  env: Env,
  text: string,
  logger: Logger,
): Promise<void> {
  const token = env.GUEST_COMMENT_TELEGRAM_BOT_TOKEN?.trim();
  const chatId = env.GUEST_COMMENT_TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) return;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: false,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      logger.warn({ status: res.status, body: body.slice(0, 200) }, 'guest comment telegram failed');
      return;
    }
    logger.info({ chatId }, 'guest comment telegram sent');
  } catch (err) {
    logger.warn({ err }, 'guest comment telegram error');
  } finally {
    clearTimeout(timeout);
  }
}

function buildTelegramMessage(payload: GuestCommentNotifyPayload, docUrl: string, preview: string): string {
  const author = payload.comment.authorName?.trim() || 'Заказчик';
  return [
    '<b>Новое замечание гостя</b>',
    escapeHtml(payload.documentTitle),
    `Версия ${payload.versionNumber}, стр. ${payload.comment.page}`,
    `Автор: ${escapeHtml(author)}`,
    '',
    escapeHtml(preview),
    '',
    `<a href="${escapeHtml(docUrl)}">Открыть документ</a>`,
  ].join('\n');
}

export async function notifyGuestCommentOwner(
  prisma: PrismaClient,
  env: Env,
  mailer: Mailer,
  logger: Logger,
  payload: GuestCommentNotifyPayload,
): Promise<void> {
  const owner = await prisma.document.findUnique({
    where: { id: payload.documentId },
    select: {
      owner: { select: { email: true, name: true } },
    },
  });

  const ownerEmail = owner?.owner.email;
  const author = payload.comment.authorName?.trim() || 'Заказчик';
  const docUrl = buildDocumentUrl(env, payload.documentId, payload.versionId, payload.comment.id);
  const preview = excerpt(payload.comment.content);

  const webhookBody = {
    event: 'guest_comment.created',
    documentId: payload.documentId,
    documentTitle: payload.documentTitle,
    versionId: payload.versionId,
    versionNumber: payload.versionNumber,
    documentUrl: docUrl,
    comment: {
      id: payload.comment.id,
      page: payload.comment.page,
      content: payload.comment.content,
      authorName: payload.comment.authorName,
      createdAt: payload.comment.createdAt.toISOString(),
    },
  };

  await postWebhook(env, webhookBody, logger);
  await postTelegram(env, buildTelegramMessage(payload, docUrl, preview), logger);

  if (!ownerEmail) {
    logger.warn({ documentId: payload.documentId }, 'guest comment notify: owner email missing');
    return;
  }

  await mailer.sendGuestCommentNotification({
    to: ownerEmail,
    ownerName: owner?.owner.name,
    documentTitle: payload.documentTitle,
    versionNumber: payload.versionNumber,
    authorName: author,
    page: payload.comment.page,
    contentPreview: preview,
    documentUrl: docUrl,
  });
}

export async function notifyGuestCommentResolvedGuest(
  env: Env,
  mailer: Mailer,
  logger: Logger,
  payload: GuestCommentResolvedNotifyPayload,
): Promise<void> {
  const guestEmail = payload.guestEmail.trim().toLowerCase();
  if (!guestEmail) return;

  const webhookBody = {
    event: 'guest_comment.resolved',
    guestEmail,
    documentId: payload.documentId,
    documentTitle: payload.documentTitle,
    versionId: payload.versionId,
    versionNumber: payload.versionNumber,
    comment: {
      id: payload.comment.id,
      page: payload.comment.page,
      authorReply: payload.comment.authorReply,
    },
  };
  await postWebhook(env, webhookBody, logger);

  await mailer.sendGuestCommentResolvedNotification({
    to: guestEmail,
    guestName: payload.guestName,
    documentTitle: payload.documentTitle,
    versionNumber: payload.versionNumber,
    page: payload.comment.page,
    authorReply: payload.comment.authorReply,
  });
}
