import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';

/**
 * Accept empty JSON bodies (e.g. DELETE with Content-Type: application/json).
 * Fastify's default parser rejects them with FST_ERR_CTP_EMPTY_JSON_BODY.
 */
const jsonBodyPluginImpl: FastifyPluginAsync = async (app) => {
  registerLenientJsonParser(app);
};

export const jsonBodyPlugin = fp(jsonBodyPluginImpl, { name: 'json-body' });

export function registerLenientJsonParser(app: FastifyInstance): void {
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    if (body === '' || body === undefined || body === null) {
      done(null, {});
      return;
    }
    try {
      done(null, JSON.parse(body as string));
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      (error as { statusCode?: number }).statusCode = 400;
      done(error, undefined);
    }
  });
}
