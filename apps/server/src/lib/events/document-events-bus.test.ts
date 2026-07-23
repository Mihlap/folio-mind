import { afterEach, describe, expect, it } from 'vitest';
import {
  publishGuestCommentDocumentEvent,
  resetDocumentEventsRedisForTests,
  subscribeDocumentVersionEvents,
} from './document-events-bus.js';
import type { Env } from '../config/env.js';

const redisUrl = process.env.REDIS_URL?.trim();

const testEnv = {
  REDIS_URL: redisUrl ?? '',
} as Env;

describe.skipIf(!redisUrl)('document-events-bus', () => {
  afterEach(() => {
    resetDocumentEventsRedisForTests();
  });

  it('delivers guest comment events to subscribers', async () => {
    const documentId = `doc-${Date.now()}`;
    const versionId = `ver-${Date.now()}`;
    const received: string[] = [];

    const subscription = await subscribeDocumentVersionEvents(
      testEnv,
      documentId,
      versionId,
      (event) => {
        received.push(event.action);
      },
    );

    await new Promise((resolve) => setTimeout(resolve, 50));

    await publishGuestCommentDocumentEvent(testEnv, documentId, versionId, 'created', 'cmt-1');

    await expect.poll(() => received, { timeout: 2000 }).toEqual(['created']);

    await subscription.close();
  });
});
