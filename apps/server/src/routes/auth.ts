import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { hashPassword, verifyPassword } from '../lib/password.js';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).optional(),
  tenantName: z.string().min(1).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const authRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post(
    '/auth/register',
    {
      schema: {
        body: registerSchema,
        response: {
          201: z.object({
            token: z.string(),
            user: z.object({
              id: z.string(),
              email: z.string(),
              name: z.string().nullable(),
              tenantId: z.string(),
            }),
          }),
          409: z.object({ error: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { email, password, name, tenantName } = request.body;
      const existing = await app.prisma.user.findUnique({ where: { email } });
      if (existing) {
        return reply.code(409).send({ error: 'Email already registered' });
      }

      const tenant = await app.prisma.tenant.create({
        data: { name: tenantName ?? `${email.split('@')[0]} workspace` },
      });

      const passwordHash = await hashPassword(password);
      const user = await app.prisma.user.create({
        data: {
          email,
          passwordHash,
          name: name ?? null,
          tenantId: tenant.id,
        },
      });

      const token = await reply.jwtSign({
        sub: user.id,
        email: user.email,
        tenantId: user.tenantId,
      });

      return reply.status(201).send({
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          tenantId: user.tenantId,
        },
      });
    },
  );

  r.post(
    '/auth/login',
    {
      schema: {
        body: loginSchema,
        response: {
          200: z.object({
            token: z.string(),
            user: z.object({
              id: z.string(),
              email: z.string(),
              name: z.string().nullable(),
              tenantId: z.string(),
            }),
          }),
          401: z.object({ error: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { email, password } = request.body;
      const user = await app.prisma.user.findUnique({ where: { email } });
      if (!user || !(await verifyPassword(password, user.passwordHash))) {
        return reply.code(401).send({ error: 'Invalid credentials' });
      }

      const token = await reply.jwtSign({
        sub: user.id,
        email: user.email,
        tenantId: user.tenantId,
      });

      return {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          tenantId: user.tenantId,
        },
      };
    },
  );
};
