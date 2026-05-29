import IORedis from 'ioredis';
import type { Env } from '../config/env.js';

let client: IORedis | null = null;

export const AI_SUMMARY_CACHE_PREFIX = 'ai:summary:';

export type CachedSummary = {
  summary: string;
  model: string;
  provider: string;
};

function getRedis(env: Env): IORedis {
  if (!client) {
    client = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  }
  return client;
}

export function summaryCacheKey(versionId: string): string {
  return `${AI_SUMMARY_CACHE_PREFIX}${versionId}`;
}

export async function getCachedSummary(
  env: Env,
  versionId: string,
): Promise<CachedSummary | null> {
  const raw = await getRedis(env).get(summaryCacheKey(versionId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CachedSummary;
  } catch {
    return null;
  }
}

export async function deleteCachedSummaries(env: Env, versionIds: string[]): Promise<void> {
  if (versionIds.length === 0) return;
  await getRedis(env).del(...versionIds.map(summaryCacheKey));
}
