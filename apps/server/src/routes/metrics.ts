import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Env } from '../lib/config/env.js';
import { getAuthMetrics } from '../lib/metrics/auth-metrics.js';
import { createMetricsShareToken, verifyMetricsShareToken } from '../lib/metrics/share-token.js';
import { renderMetricsShareErrorPage, renderMetricsSharePage } from '../lib/metrics/share-page.js';

function tokenMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

const byDaySchema = z.object({
  day: z.string(),
  registrations: z.number(),
  logins: z.number(),
});

const metricsSchema = z.object({
  from: z.string(),
  to: z.string(),
  registrations: z.number(),
  logins: z.number(),
  activeUsers: z.number(),
  byDay: z.array(byDaySchema),
});

const shareSchema = z.object({
  url: z.string(),
  token: z.string(),
  days: z.number(),
  hours: z.number(),
  expiresAt: z.string(),
});

/** Собирает ссылку на страницу статистики по тому же хосту, что и текущий запрос. */
function buildShareUrl(
  origin: { protocol: string; host: string },
  token: string,
  days: number,
): string {
  return `${origin.protocol}://${origin.host}/metrics/auth/share/${token}?days=${days}`;
}

export const metricsRoutes: FastifyPluginAsync<{ env: Env }> = async (app, opts) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const env = opts.env;

  r.get(
    '/metrics/auth',
    {
      schema: {
        querystring: z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }),
        response: { 200: metricsSchema, 401: z.object({ error: z.string() }) },
      },
    },
    async (request, reply) => {
      const expected = env.AUTH_METRICS_TOKEN;
      const header = request.headers.authorization;
      const provided =
        typeof header === 'string' && header.startsWith('Bearer ')
          ? header.slice('Bearer '.length).trim()
          : '';
      if (!expected || !provided || !tokenMatches(provided, expected)) {
        return reply.code(401).send({ error: 'Требуется корректный токен метрик' });
      }

      const summary = await getAuthMetrics(app.prisma, { days: request.query.days });
      return {
        from: summary.from,
        to: summary.to,
        registrations: summary.registrations,
        logins: summary.logins,
        activeUsers: summary.activeUsers,
        byDay: summary.byDay,
      };
    },
  );

  // Выдача разовой ссылки на статистику. Требует основной токен метрик.
  r.post(
    '/metrics/auth/share',
    {
      schema: {
        querystring: z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }),
        body: z.object({ hours: z.number().int().min(1).max(168).optional() }).optional(),
        response: {
          200: shareSchema,
          401: z.object({ error: z.string() }),
          400: z.object({ error: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const expected = env.AUTH_METRICS_TOKEN;
      const header = request.headers.authorization;
      const provided =
        typeof header === 'string' && header.startsWith('Bearer ')
          ? header.slice('Bearer '.length).trim()
          : '';
      if (!expected || !provided || !tokenMatches(provided, expected)) {
        return reply.code(401).send({ error: 'Требуется корректный токен метрик' });
      }

      const share = createMetricsShareToken(expected, request.body?.hours);
      const days = request.query.days;
      return {
        url: buildShareUrl({ protocol: request.protocol, host: request.host }, share.token, days),
        token: share.token,
        days,
        hours: share.ttlHours,
        expiresAt: share.expiresAt,
      };
    },
  );

  // Страница по разовой ссылке. Токен внутри ссылки, истекает сам.
  r.get(
    '/metrics/auth/share/:token',
    {
      schema: {
        params: z.object({ token: z.string().min(8) }),
        querystring: z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }),
      },
    },
    async (request, reply) => {
      const secret = env.AUTH_METRICS_TOKEN;
      if (!secret) {
        return reply
          .code(401)
          .type('text/html; charset=utf-8')
          .send(renderMetricsShareErrorPage('bad-signature'));
      }

      const check = verifyMetricsShareToken(request.params.token, secret);
      if (!check.ok) {
        return reply
          .code(check.reason === 'expired' ? 410 : 401)
          .type('text/html; charset=utf-8')
          .send(renderMetricsShareErrorPage(check.reason));
      }

      const summary = await getAuthMetrics(app.prisma, { days: request.query.days });
      return reply.type('text/html; charset=utf-8').send(
        renderMetricsSharePage({
          from: summary.from,
          to: summary.to,
          registrations: summary.registrations,
          logins: summary.logins,
          activeUsers: summary.activeUsers,
          byDay: summary.byDay,
          expiresAt: new Date(check.expiresAtMs).toISOString(),
          days: request.query.days,
        }),
      );
    },
  );
};
