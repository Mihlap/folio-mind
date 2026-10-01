import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import type { Env } from './lib/config/env.js';
import { parseCorsOrigins } from './lib/config/cors-origins.js';
import { GLOBAL_RATE_LIMIT } from './lib/auth/rate-limits.js';
import { prismaPlugin } from './plugins/prisma.js';
import { jsonBodyPlugin } from './plugins/json-body.js';
import { requestIdPlugin } from './plugins/request-id.js';
import { tracingPlugin } from './plugins/tracing.js';
import { aiRoutes } from './routes/ai.js';
import { annotationRoutes } from './routes/annotations.js';
import { authRoutes } from './routes/auth.js';
import { oauthRoutes } from './routes/oauth.js';
import { documentRoutes } from './routes/documents.js';
import { publicShareRoutes } from './routes/public-share.js';
import { healthRoutes } from './routes/health.js';
import { metricsRoutes } from './routes/metrics.js';
import { meRoutes } from './routes/me.js';
import { ragRoutes } from './routes/rag.js';
import { layoutTemplateRoutes } from './routes/layout-templates.js';
import { presentationRoutes } from './routes/presentations.js';
import { mediaRoutes } from './routes/media.js';
import { projectRoutes } from './routes/projects.js';
import { pageReviewRoutes } from './routes/page-review.js';
import { apiV1Routes } from './routes/api/v1/index.js';
export type BuildAppOptions = {
  env: Env;
  skipDatabase?: boolean;
};
export async function buildApp(options: BuildAppOptions) {
  const app = Fastify({
    logger: options.env.NODE_ENV !== 'test',
    bodyLimit: 16 * 1024 * 1024,
  });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(jsonBodyPlugin);
  await app.register(requestIdPlugin);
  await app.register(tracingPlugin);
  await app.register(cors, {
    origin: parseCorsOrigins(options.env.CORS_ORIGIN),
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Folio-Share-Password'],
  });
  await app.register(cookie);
  await app.register(jwt, { secret: options.env.JWT_SECRET });
  await app.register(multipart, {
    limits: {
      fileSize: 100 * 1024 * 1024,
      files: 1,
    },
  });
  await app.register(rateLimit, GLOBAL_RATE_LIMIT);
  await app.register(swagger, {
    openapi: {
      info: { title: 'Folio Mind API', version: '0.0.1' },
    },
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });
  app.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.send(err);
    }
  });
  if (!options.skipDatabase && options.env.DATABASE_URL) {
    await app.register(prismaPlugin, { databaseUrl: options.env.DATABASE_URL });
    await app.register(healthRoutes, { env: options.env });
    await app.register(authRoutes, { env: options.env });
    await app.register(oauthRoutes, { env: options.env });
    await app.register(meRoutes);
    await app.register(documentRoutes, { env: options.env });
    await app.register(publicShareRoutes, { env: options.env });
    await app.register(annotationRoutes, { env: options.env });
    await app.register(aiRoutes, { env: options.env });
    await app.register(ragRoutes, { env: options.env });
    await app.register(mediaRoutes, { env: options.env });
    await app.register(layoutTemplateRoutes);
    await app.register(projectRoutes, { env: options.env });
    await app.register(pageReviewRoutes, { env: options.env });
    await app.register(presentationRoutes, { env: options.env });
    await app.register(metricsRoutes, { env: options.env });
    await app.register(apiV1Routes, { env: options.env });
  } else if (options.skipDatabase) {
    await app.register(healthRoutes, { env: options.env });
  }
  return app;
}
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
