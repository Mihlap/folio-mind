import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import type { Env } from '../lib/env.js';
import { getQueueMetrics } from '../lib/queue.js';

export const healthRoutes: FastifyPluginAsync<{ env?: Env }> = async (app, opts) => {
  app.get('/health', async (request) => {
    const headerId = request.headers['x-request-id'];
    const requestId =
      request.requestId ??
      (typeof headerId === 'string' && headerId.length > 0 ? headerId : randomUUID());

    const base = {
      status: 'ok' as const,
      timestamp: new Date().toISOString(),
      requestId,
    };

    const env = opts.env;
    if (!env?.REDIS_URL) {
      return base;
    }

    try {
      const queues = await getQueueMetrics(env);
      const waitingTotal = queues.preview.waiting + queues.ai.waiting;
      const degraded = waitingTotal >= env.QUEUE_WARN_WAITING;

      return {
        ...base,
        status: degraded ? ('degraded' as const) : ('ok' as const),
        queues,
        queueWarnWaiting: env.QUEUE_WARN_WAITING,
      };
    } catch {
      return {
        ...base,
        status: 'degraded' as const,
        queues: null,
        queueError: 'Unable to read BullMQ metrics',
      };
    }
  });
};
