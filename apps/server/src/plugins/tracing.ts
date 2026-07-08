import { getTracer, isTracingEnabled, SpanStatusCode, type Span } from '@folio-mind/observability';
import type { FastifyPluginAsync } from 'fastify';
declare module 'fastify' {
  interface FastifyRequest {
    otelSpan?: Span;
  }
}
export const tracingPlugin: FastifyPluginAsync = async (app) => {
  if (!isTracingEnabled()) return;
  const tracer = getTracer('folio-mind-api');
  app.addHook('onRequest', async (request) => {
    const route = request.routeOptions?.url ?? request.url;
    request.otelSpan = tracer.startSpan(`${request.method} ${route}`, {
      attributes: {
        'http.method': request.method,
        'http.route': route,
        'folio.request_id': request.requestId,
      },
    });
  });
  app.addHook('onResponse', async (request, reply) => {
    const span = request.otelSpan;
    if (!span) return;
    span.setAttribute('http.status_code', reply.statusCode);
    if (reply.statusCode >= 500) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: `HTTP ${reply.statusCode}` });
    }
    span.end();
  });
};
