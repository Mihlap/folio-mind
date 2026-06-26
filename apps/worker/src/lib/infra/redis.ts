import IORedis from 'ioredis';
let client: IORedis | null = null;
export function getRedis(redisUrl: string): IORedis {
  if (!client) {
    client = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  }
  return client;
}
export const AI_SUMMARY_CACHE_PREFIX = 'ai:summary:';
export type CachedSummary = {
  summary: string;
  model: string;
  provider: string;
};
export function summaryCacheKey(versionId: string): string {
  return `${AI_SUMMARY_CACHE_PREFIX}${versionId}`;
}
export async function getCachedSummary(
  redisUrl: string,
  versionId: string,
): Promise<CachedSummary | null> {
  const raw = await getRedis(redisUrl).get(summaryCacheKey(versionId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CachedSummary;
  } catch {
    return null;
  }
}
export async function setCachedSummary(
  redisUrl: string,
  versionId: string,
  value: CachedSummary,
  ttlSeconds = 7 * 24 * 60 * 60,
): Promise<void> {
  await getRedis(redisUrl).set(summaryCacheKey(versionId), JSON.stringify(value), 'EX', ttlSeconds);
}
