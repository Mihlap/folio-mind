import { PrismaClient } from '@prisma/client';
import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

type PrismaPluginOpts = {
  databaseUrl?: string;
};

const prismaPluginImpl: FastifyPluginAsync<PrismaPluginOpts> = async (app, opts) => {
  const prisma = new PrismaClient(
    opts.databaseUrl
      ? {
          datasources: {
            db: { url: opts.databaseUrl },
          },
        }
      : undefined,
  );
  await prisma.$connect();
  app.decorate('prisma', prisma);
  app.addHook('onClose', async () => {
    await prisma.$disconnect();
  });
};

export const prismaPlugin = fp(prismaPluginImpl, { name: 'prisma' });
