import IORedis from 'ioredis';
import {
  documentMetaEventsChannel,
  documentVersionEventsChannel,
  parseDocumentMetaScopeEvent,
  parseDocumentVersionScopeEvent,
  type DocumentMemberRole,
  type DocumentMetaScopeEvent,
  type DocumentReviewStatus,
  type DocumentVersionScopeEvent,
  type GuestCommentEventAction,
  type MemberAccessEventAction,
  type PageReviewEventAction,
} from '@folio-mind/pdf-contracts';
import type { Env } from '../config/env.js';

let publisherRedis: IORedis | null = null;

function isRedisConfigured(env: Env): boolean {
  return Boolean(env.REDIS_URL?.trim());
}

function getPublisherRedis(env: Env): IORedis {
  if (!isRedisConfigured(env)) {
    throw new Error('REDIS_NOT_CONFIGURED');
  }
  if (!publisherRedis) {
    publisherRedis = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  }
  return publisherRedis;
}

export async function publishDocumentVersionScopeEvent(
  env: Env,
  event: DocumentVersionScopeEvent,
): Promise<void> {
  if (!isRedisConfigured(env)) return;
  const channel = documentVersionEventsChannel(event.documentId, event.versionId);
  await getPublisherRedis(env).publish(channel, JSON.stringify(event));
}

export async function publishDocumentMetaScopeEvent(
  env: Env,
  event: DocumentMetaScopeEvent,
): Promise<void> {
  if (!isRedisConfigured(env)) return;
  const channel = documentMetaEventsChannel(event.documentId);
  await getPublisherRedis(env).publish(channel, JSON.stringify(event));
}

export async function publishGuestCommentDocumentEvent(
  env: Env,
  documentId: string,
  versionId: string,
  action: GuestCommentEventAction,
  commentId?: string,
): Promise<void> {
  await publishDocumentVersionScopeEvent(env, {
    type: 'guest_comment',
    documentId,
    versionId,
    action,
    ...(commentId ? { commentId } : {}),
  });
}

export async function publishPageReviewDocumentEvent(
  env: Env,
  documentId: string,
  versionId: string,
  action: PageReviewEventAction,
  page?: number,
): Promise<void> {
  await publishDocumentVersionScopeEvent(env, {
    type: 'page_review',
    documentId,
    versionId,
    action,
    ...(page !== undefined ? { page } : {}),
  });
}

export async function publishReviewStatusDocumentEvent(
  env: Env,
  documentId: string,
  reviewStatus: DocumentReviewStatus,
): Promise<void> {
  await publishDocumentMetaScopeEvent(env, {
    type: 'review_status',
    documentId,
    reviewStatus,
  });
}

export async function publishMemberAccessDocumentEvent(
  env: Env,
  documentId: string,
  userId: string,
  action: MemberAccessEventAction,
  role?: DocumentMemberRole,
): Promise<void> {
  await publishDocumentMetaScopeEvent(env, {
    type: 'member_access',
    documentId,
    userId,
    action,
    ...(role ? { role } : {}),
  });
}

export async function publishVersionCreatedDocumentEvent(
  env: Env,
  documentId: string,
  versionId: string,
  version: number,
): Promise<void> {
  await publishDocumentMetaScopeEvent(env, {
    type: 'version_created',
    documentId,
    versionId,
    version,
  });
}

export async function publishVersionDeletedDocumentEvent(
  env: Env,
  documentId: string,
  versionId: string,
): Promise<void> {
  await publishDocumentMetaScopeEvent(env, {
    type: 'version_deleted',
    documentId,
    versionId,
  });
}

export type DocumentEventSubscription = {
  close: () => Promise<void>;
};

async function subscribeRedisChannel(
  env: Env,
  channel: string,
  parse: (raw: string) => unknown,
  onEvent: (event: unknown) => void,
): Promise<DocumentEventSubscription> {
  const subscriber = getPublisherRedis(env).duplicate();
  await subscriber.subscribe(channel);

  const onMessage = (ch: string, message: string) => {
    if (ch !== channel) return;
    const parsed = parse(message);
    if (parsed) onEvent(parsed);
  };

  subscriber.on('message', onMessage);

  return {
    close: async () => {
      subscriber.off('message', onMessage);
      try {
        await subscriber.unsubscribe(channel);
        await subscriber.quit();
      } catch {
        subscriber.disconnect();
      }
    },
  };
}

export async function subscribeDocumentVersionEvents(
  env: Env,
  documentId: string,
  versionId: string,
  onEvent: (event: DocumentVersionScopeEvent) => void,
): Promise<DocumentEventSubscription> {
  if (!isRedisConfigured(env)) {
    throw new Error('REDIS_NOT_CONFIGURED');
  }
  return subscribeRedisChannel(
    env,
    documentVersionEventsChannel(documentId, versionId),
    parseDocumentVersionScopeEvent,
    onEvent as (event: unknown) => void,
  );
}

export async function subscribeDocumentMetaEvents(
  env: Env,
  documentId: string,
  onEvent: (event: DocumentMetaScopeEvent) => void,
): Promise<DocumentEventSubscription> {
  if (!isRedisConfigured(env)) {
    throw new Error('REDIS_NOT_CONFIGURED');
  }
  return subscribeRedisChannel(
    env,
    documentMetaEventsChannel(documentId),
    parseDocumentMetaScopeEvent,
    onEvent as (event: unknown) => void,
  );
}

export function resetDocumentEventsRedisForTests(): void {
  if (publisherRedis) {
    publisherRedis.disconnect();
    publisherRedis = null;
  }
}

export { isRedisConfigured as isDocumentEventsRedisConfigured };
