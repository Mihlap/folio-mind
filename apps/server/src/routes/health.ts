import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async (request) => {
    const headerId = request.headers['x-request-id'];
    const requestId =
      request.requestId ??
      (typeof headerId === 'string' && headerId.length > 0 ? headerId : randomUUID());

    return {
      status: 'ok' as const,
      timestamp: new Date().toISOString(),
      requestId,
    };
  });
};
