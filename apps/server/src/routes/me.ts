import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

export const meRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/me',
    {
      preHandler: [app.authenticate],
      schema: {
        response: {
          200: z.object({
            id: z.string(),
            email: z.string(),
            name: z.string().nullable(),
            tenantId: z.string(),
          }),
        },
      },
    },
    async (request) => {
      const user = await app.prisma.user.findUniqueOrThrow({
        where: { id: request.user.sub },
      });
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        tenantId: user.tenantId,
      };
    },
  );
};

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; email: string; tenantId: string };
    user: { sub: string; email: string; tenantId: string };
  }
}
