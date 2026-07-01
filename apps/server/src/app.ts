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
import { GLOBAL_RATE_LIMIT } from './lib/auth/rate-limits.js';
import { prismaPlugin } from './plugins/prisma.js';
import { requestIdPlugin } from './plugins/request-id.js';
import { tracingPlugin } from './plugins/tracing.js';
import { aiRoutes } from './routes/ai.js';
import { annotationRoutes } from './routes/annotations.js';
import { authRoutes } from './routes/auth.js';
import { oauthRoutes } from './routes/oauth.js';
import { documentRoutes } from './routes/documents.js';
import { healthRoutes } from './routes/health.js';
import { meRoutes } from './routes/me.js';
import { ragRoutes } from './routes/rag.js';
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
  await app.register(requestIdPlugin);
  await app.register(tracingPlugin);
  await app.register(cors, {
    origin: options.env.CORS_ORIGIN,
    credentials: true,
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
    await app.register(prismaPlugin);
    await app.register(healthRoutes, { env: options.env });
    await app.register(authRoutes, { env: options.env });
    await app.register(oauthRoutes, { env: options.env });
    await app.register(meRoutes);
    await app.register(documentRoutes, { env: options.env });
    await app.register(annotationRoutes);
    await app.register(aiRoutes, { env: options.env });
    await app.register(ragRoutes, { env: options.env });
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
