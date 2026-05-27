import IORedis from 'ioredis';
import type { Env } from './env.js';

const USAGE_PREFIX = 'ai:usage:';

let redis: IORedis | null = null;

function getRedis(env: Env): IORedis {
  if (!redis) {
    redis = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  }
  return redis;
}

function dayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export class AiLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiLimitError';
  }
}

export async function checkAndIncrementAiUsage(env: Env, tenantId: string): Promise<void> {
  const key = `${USAGE_PREFIX}${tenantId}:${dayKey()}:requests`;
  const count = await getRedis(env).incr(key);
  if (count === 1) {
    await getRedis(env).expire(key, 86_400 * 2);
  }
  if (count > env.AI_TENANT_DAILY_REQUESTS) {
    await getRedis(env).decr(key);
    throw new AiLimitError(
      `Дневной лимит запросов ИИ (${env.AI_TENANT_DAILY_REQUESTS}) исчерпан. Попробуйте завтра.`,
    );
  }
}

export async function getAiUsageToday(env: Env, tenantId: string): Promise<number> {
  const raw = await getRedis(env).get(`${USAGE_PREFIX}${tenantId}:${dayKey()}:requests`);
  return raw ? Number(raw) : 0;
}
