import { afterEach, describe, expect, it } from 'vitest';
import {
  publishAnnotationDocumentEvent,
  publishGuestCommentDocumentEvent,
  publishShareLinkDocumentEvent,
  publishSuggestionStatusDocumentEvent,
  resetDocumentEventsRedisForTests,
  subscribeDocumentMetaEvents,
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

  it('delivers annotation events to subscribers', async () => {
    const documentId = `doc-${Date.now()}`;
    const versionId = `ver-${Date.now()}`;
    const received: Array<{ action: string; annotationId?: string }> = [];

    const subscription = await subscribeDocumentVersionEvents(
      testEnv,
      documentId,
      versionId,
      (event) => {
        if (event.type === 'annotation') {
          received.push({ action: event.action, annotationId: event.annotationId });
        }
      },
    );

    await new Promise((resolve) => setTimeout(resolve, 50));

    await publishAnnotationDocumentEvent(testEnv, documentId, versionId, 'created', 'ann-7');

    await expect.poll(() => received, { timeout: 2000 }).toEqual([
      { action: 'created', annotationId: 'ann-7' },
    ]);

    await subscription.close();
  });

  it('delivers suggestion status events to subscribers', async () => {
    const documentId = `doc-${Date.now()}`;
    const versionId = `ver-${Date.now()}`;
    const received: string[] = [];

    const subscription = await subscribeDocumentVersionEvents(
      testEnv,
      documentId,
      versionId,
      (event) => {
        if (event.type === 'suggestion') {
          received.push(event.action);
        }
      },
    );

    await new Promise((resolve) => setTimeout(resolve, 50));

    await publishSuggestionStatusDocumentEvent(testEnv, documentId, versionId, 'accepted', 'sup-4');

    await expect.poll(() => received, { timeout: 2000 }).toEqual(['accepted']);

    await subscription.close();
  });

  it('delivers share link events to meta subscribers', async () => {
    const documentId = `doc-${Date.now()}`;
    const received: Array<{ action: string; linkId: string }> = [];

    const subscription = await subscribeDocumentMetaEvents(testEnv, documentId, (event) => {
      if (event.type === 'share_link') {
        received.push({ action: event.action, linkId: event.linkId });
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    await publishShareLinkDocumentEvent(testEnv, documentId, 'created', 'link-3', 'ver-9');

    await expect.poll(() => received, { timeout: 2000 }).toEqual([
      { action: 'created', linkId: 'link-3' },
    ]);

    await subscription.close();
  });
});
