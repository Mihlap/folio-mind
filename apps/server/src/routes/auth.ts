import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { hashPassword, verifyPassword } from '../lib/password.js';
import type { Env } from '../lib/env.js';
import { AUTH_PASSWORD_RESET_RATE_LIMIT } from '../lib/rate-limits.js';
import {
  buildPasswordResetUrl,
  createPasswordResetToken,
  sha256Hex,
} from '../lib/password-reset.js';
import { createMailer } from '../lib/mailer.js';

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

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(10),
  newPassword: z.string().min(8),
});

export const authRoutes: FastifyPluginAsync<{ env: Env }> = async (app, opts) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const env = opts.env;

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

  r.post(
    '/auth/forgot-password',
    {
      config: { rateLimit: AUTH_PASSWORD_RESET_RATE_LIMIT },
      schema: {
        body: forgotPasswordSchema,
        response: {
          200: z.object({ ok: z.literal(true) }),
          503: z.object({ error: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const email = request.body.email.toLowerCase().trim();
      const user = await app.prisma.user.findUnique({ where: { email } });
      if (!user) {
        return { ok: true as const };
      }

      const { token, tokenHash, expiresAt } = createPasswordResetToken(env);
      await app.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
        },
      });

      const url = buildPasswordResetUrl(env, token);
      try {
        const mailer = createMailer(env, request.log);
        await mailer.sendPasswordResetEmail({ to: email, resetUrl: url });
      } catch (err) {
        request.log.error({ err, email }, 'password reset email failed');
        return reply.code(503).send({
          error:
            'Не удалось отправить письмо. Проверьте SMTP_HOST=smtp.mail.ru и пароль ящика folio_mind@mail.ru',
        });
      }

      return { ok: true as const };
    },
  );

  r.post(
    '/auth/reset-password',
    {
      config: { rateLimit: AUTH_PASSWORD_RESET_RATE_LIMIT },
      schema: {
        body: resetPasswordSchema,
        response: {
          200: z.object({ ok: z.literal(true) }),
          400: z.object({ error: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const token = request.body.token.trim();
      const tokenHash = sha256Hex(token);

      const record = await app.prisma.passwordResetToken.findUnique({
        where: { tokenHash },
      });

      if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) {
        return reply.code(400).send({ error: 'Ссылка для сброса пароля недействительна или устарела' });
      }

      const passwordHash = await hashPassword(request.body.newPassword);

      await app.prisma.$transaction([
        app.prisma.user.update({
          where: { id: record.userId },
          data: { passwordHash },
        }),
        app.prisma.passwordResetToken.update({
          where: { id: record.id },
          data: { usedAt: new Date() },
        }),   
        app.prisma.passwordResetToken.updateMany({
          where: { userId: record.userId, usedAt: null },
          data: { usedAt: new Date() },
        }),
      ]);

      return { ok: true as const };
    },
  );
};
