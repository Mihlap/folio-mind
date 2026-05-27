import type { Env } from './env.js';

export function getPreviewConfig(env: Env) {
  return {
    initialPages: env.PREVIEW_INITIAL_PAGES,
    maxPages: env.PREVIEW_MAX_PAGES,
    thumbBatch: env.PREVIEW_THUMB_BATCH,
  };
}

export function clampPreviewRange(
  env: Env,
  pageCount: number,
  from?: number,
  to?: number,
): { from: number; to: number } {
  const { maxPages, thumbBatch } = getPreviewConfig(env);
  const cappedCount = Math.min(pageCount, maxPages);
  const start = Math.max(1, from ?? 1);
  const end = Math.min(cappedCount, to ?? Math.min(cappedCount, start + thumbBatch - 1));
  return { from: start, to: Math.max(start, end) };
}
