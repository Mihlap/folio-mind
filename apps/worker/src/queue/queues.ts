import { Queue } from 'bullmq';
import IORedis from 'ioredis';
export const QUEUE_NAMES = {
  preview: 'preview',
  ai: 'ai',
  optimize: 'optimize',
} as const;
export function createRedisConnection(redisUrl: string) {
  return new IORedis(redisUrl, { maxRetriesPerRequest: null });
}
export function createQueues(connection: IORedis) {
  const defaultJobOptions = {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 3,
    backoff: { type: 'exponential' as const, delay: 2000 },
  };
  return {
    preview: new Queue(QUEUE_NAMES.preview, { connection, defaultJobOptions }),
    ai: new Queue(QUEUE_NAMES.ai, { connection, defaultJobOptions }),
    optimize: new Queue(QUEUE_NAMES.optimize, { connection, defaultJobOptions }),
  };
}
