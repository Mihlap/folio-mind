import type { FastifyReply, FastifyRequest } from 'fastify';
import type {
  DocumentMetaScopeEvent,
  DocumentVersionScopeEvent,
} from '@folio-mind/pdf-contracts';
import type { Env } from '../config/env.js';
import { parseCorsOrigins } from '../config/cors-origins.js';
import {
  subscribeDocumentMetaEvents,
  subscribeDocumentVersionEvents,
  type DocumentEventSubscription,
} from './document-events-bus.js';

const SSE_HEARTBEAT_MS = 30_000;

/**
 * `@fastify/cors` добавляет CORS-заголовки в хуке `onSend`, который
 * обходится при `reply.hijack()`. Поэтому для SSE-стрима, пишущего в raw-ответ
 * напрямую, CORS-заголовки нужно проставлять вручную — иначе браузер блокирует
 * cross-origin ответ, и клиент бесконечно переподключается с растущим backoff.
 */
function resolveCorsOrigin(
  requestOrigin: string | undefined,
  allowed: string | string[],
): string | null {
  if (!requestOrigin) return null;
  const allowList = Array.isArray(allowed) ? allowed : [allowed];
  if (allowList.includes('*')) return '*';
  return allowList.includes(requestOrigin) ? requestOrigin : null;
}

export function initSseStream(
  reply: FastifyReply,
  request: FastifyRequest,
  allowedCorsOrigins: string | string[],
): void {
  const origin = resolveCorsOrigin(request.headers.origin, allowedCorsOrigins);
  const headers: Record<string, string> = {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
    headers['Vary'] = 'Origin';
  }
  reply.hijack();
  reply.raw.writeHead(200, headers);
  reply.raw.flushHeaders?.();
}

export function writeSseEvent(reply: FastifyReply, event: string, data: unknown): void {
  reply.raw.write(`event: ${event}\n`);
  reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
}

export function writeSseComment(reply: FastifyReply): void {
  reply.raw.write(': ping\n\n');
}

export function startSseHeartbeat(reply: FastifyReply): () => void {
  const timer = setInterval(() => writeSseComment(reply), SSE_HEARTBEAT_MS);
  return () => clearInterval(timer);
}

export function writeVersionScopeSseEvent(
  reply: FastifyReply,
  event: DocumentVersionScopeEvent,
): void {
  switch (event.type) {
    case 'guest_comment':
      writeSseEvent(reply, 'guest_comment', {
        action: event.action,
        commentId: event.commentId ?? null,
        versionId: event.versionId,
      });
      break;
    case 'page_review':
      writeSseEvent(reply, 'page_review', {
        action: event.action,
        page: event.page ?? null,
        versionId: event.versionId,
      });
      break;
    default:
      break;
  }
}

export function writeMetaScopeSseEvent(reply: FastifyReply, event: DocumentMetaScopeEvent): void {
  switch (event.type) {
    case 'review_status':
      writeSseEvent(reply, 'review_status', {
        reviewStatus: event.reviewStatus,
        documentId: event.documentId,
      });
      break;
    case 'member_access':
      writeSseEvent(reply, 'member_access', {
        documentId: event.documentId,
        userId: event.userId,
        action: event.action,
        role: event.role ?? null,
      });
      break;
    case 'version_created':
      writeSseEvent(reply, 'version_created', {
        documentId: event.documentId,
        versionId: event.versionId,
        version: event.version,
      });
      break;
    case 'version_deleted':
      writeSseEvent(reply, 'version_deleted', {
        documentId: event.documentId,
        versionId: event.versionId,
      });
      break;
    default:
      break;
  }
}

type StreamOptions = {
  env: Env;
  request: FastifyRequest;
  reply: FastifyReply;
  documentId: string;
  versionId: string;
  includeDocumentMeta?: boolean;
};

export async function streamDocumentScopeEvents({
  env,
  request,
  reply,
  documentId,
  versionId,
  includeDocumentMeta = false,
}: StreamOptions): Promise<void> {
  initSseStream(reply, request, parseCorsOrigins(env.CORS_ORIGIN));
  writeSseEvent(reply, 'connected', { documentId, versionId });

  const subscriptions: DocumentEventSubscription[] = [];
  let cleanedUp = false;
  let stopHeartbeat = () => {};

  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    stopHeartbeat();
    for (const subscription of subscriptions) {
      void subscription.close().catch((err) => {
        request.log.warn({ err }, 'document events subscription close failed');
      });
    }
    subscriptions.length = 0;
  };

  stopHeartbeat = startSseHeartbeat(reply);

  try {
    subscriptions.push(
      await subscribeDocumentVersionEvents(env, documentId, versionId, (event) => {
        writeVersionScopeSseEvent(reply, event);
      }),
    );

    if (includeDocumentMeta) {
      subscriptions.push(
        await subscribeDocumentMetaEvents(env, documentId, (event) => {
          writeMetaScopeSseEvent(reply, event);
        }),
      );
    }
  } catch (err) {
    request.log.error({ err }, 'document events subscription failed');
    cleanup();
    reply.raw.end();
    return;
  }

  request.raw.on('close', cleanup);
  request.raw.on('error', cleanup);
}
