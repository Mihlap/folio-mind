import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { hashPassword, verifyPassword } from '../lib/auth/password.js';
import type { Env } from '../lib/config/env.js';
import {
  AUTH_LOGIN_RATE_LIMIT,
  AUTH_MAGIC_LINK_RATE_LIMIT,
  AUTH_PASSWORD_RESET_RATE_LIMIT,
  AUTH_REGISTER_RATE_LIMIT,
  AUTH_RESEND_VERIFICATION_RATE_LIMIT,
} from '../lib/auth/rate-limits.js';
import {
  buildPasswordResetUrl,
  createPasswordResetToken,
  sha256Hex,
} from '../lib/auth/password-reset.js';
import {
  buildVerifyEmailUrl,
  createEmailVerificationToken,
} from '../lib/auth/email-verification.js';
import { renderVerifyEmailHtmlPage } from '../lib/auth/verify-email-html.js';
import { verifyEmailWithToken } from '../lib/auth/verify-email-token.js';
import { createMailer } from '../lib/email/mailer.js';
import { normalizeEmail } from '../lib/email/email.js';
import { validateEmailForRegistration } from '../lib/email/email-validation.js';
import { passwordSchema } from '../lib/auth/password-policy.js';
import { verifyTurnstileToken } from '../lib/auth/turnstile.js';
import { createMagicLinkToken, buildMagicLinkUrl } from '../lib/auth/magic-link.js';
import { hashUnusablePassword } from '../lib/auth/password.js';
import { createSmsSender } from '../lib/auth/sms.js';
import {
  consumeTenantInvite,
  findActiveTenantInvite,
  acceptTenantInviteForUser,
} from '../lib/tenant/tenant-invite.js';
const registerSchema = z.object({
  email: z.string().email(),
  password: passwordSchema,
  name: z.string().min(1).optional(),
  tenantName: z.string().min(1).optional(),
  captchaToken: z.string().optional(),
  inviteToken: z.string().min(10).optional(),
});
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  captchaToken: z.string().optional(),
});
const forgotPasswordSchema = z.object({
  email: z.string().email(),
});
const resetPasswordSchema = z.object({
  token: z.string().min(10),
  newPassword: passwordSchema,
});
const verifyEmailSchema = z.object({
  token: z.string().min(10),
});
const resendVerificationSchema = z.object({
  email: z.string().email(),
});
const emailVerificationStatusSchema = z.object({
  email: z.string().email(),
});
const magicLinkRequestSchema = z.object({
  email: z.string().email(),
  captchaToken: z.string().optional(),
});
const magicLinkVerifySchema = z.object({
  token: z.string().min(10),
});
const phoneRegex = /^\+?[1-9]\d{6,14}$/;
const sendCodeSchema = z.object({
  phone: z.string().regex(phoneRegex, 'Некорректный номер телефона'),
});
const phoneRegisterSchema = z.object({
  phone: z.string().regex(phoneRegex, 'Некорректный номер телефона'),
  code: z.string().length(6),
  name: z.string().min(1).optional(),
});
const phoneLoginSchema = z.object({
  phone: z.string().regex(phoneRegex, 'Некорректный номер телефона'),
  code: z.string().length(6),
});
const authUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  tenantId: z.string(),
  emailVerified: z.boolean(),
});
const authErrorSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
  code: z.string().optional(),
});
type JwtPayload = {
  sub: string;
  email: string;
  tenantId: string;
};
async function issueAuthToken(
  reply: {
    jwtSign: (payload: JwtPayload) => Promise<string>;
  },
  user: {
    id: string;
    email: string;
    tenantId: string;
  },
) {
  return reply.jwtSign({
    sub: user.id,
    email: user.email,
    tenantId: user.tenantId,
  });
}
async function findOrCreateUserForMagicLink(prisma: PrismaClient, email: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;
  const tenant = await prisma.tenant.create({
    data: { name: `${email.split('@')[0]} workspace` },
  });
  return prisma.user.create({
    data: {
      email,
      passwordHash: await hashUnusablePassword(),
      tenantId: tenant.id,
      emailVerifiedAt: null,
    },
  });
}
async function sendVerificationEmailForUser(
  prisma: PrismaClient,
  env: Env,
  userId: string,
  email: string,
  log: {
    info: (obj: unknown, msg?: string) => void;
    warn: (obj: unknown, msg?: string) => void;
    error: (obj: unknown, msg?: string) => void;
  },
) {
  const { token, tokenHash, expiresAt } = createEmailVerificationToken(env);
  await prisma.emailVerificationToken.create({
    data: { userId, tokenHash, expiresAt },
  });
  const verifyUrl = buildVerifyEmailUrl(env, token);
  const mailer = createMailer(env, log);
  await mailer.sendEmailVerification({ to: email, verifyUrl });
}
export const authRoutes: FastifyPluginAsync<{
  env: Env;
}> = async (app, opts) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const env = opts.env;
  const skipMx = env.SKIP_EMAIL_MX_CHECK || env.NODE_ENV === 'test';
  r.post(
    '/auth/register',
    {
      config: { rateLimit: AUTH_REGISTER_RATE_LIMIT },
      schema: {
        body: registerSchema,
        response: {
          201: z.object({
            needsEmailVerification: z.literal(true),
            email: z.string(),
            message: z.string(),
          }),
          400: authErrorSchema,
          409: authErrorSchema,
          503: authErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const captchaOk = await verifyTurnstileToken(request.body.captchaToken, request.ip, env);
      if (!captchaOk) {
        return reply.code(400).send({
          error: 'CAPTCHA_FAILED',
          message: 'Не пройдена проверка CAPTCHA',
        });
      }
      const emailCheck = await validateEmailForRegistration(request.body.email, { skipMx });
      if ('error' in emailCheck) {
        return reply.code(400).send({
          error: emailCheck.error.code,
          message: emailCheck.error.message,
        });
      }
      const email = emailCheck.email;
      const existing = await app.prisma.user.findUnique({ where: { email } });
      if (existing) {
        return reply.code(409).send({
          error: 'EMAIL_ALREADY_REGISTERED',
          message: 'Этот email уже зарегистрирован',
        });
      }

      const inviteToken = request.body.inviteToken?.trim();
      let tenantInvite: Awaited<ReturnType<typeof findActiveTenantInvite>> = null;
      if (inviteToken) {
        tenantInvite = await findActiveTenantInvite(app.prisma, inviteToken);
        if (!tenantInvite) {
          return reply.code(400).send({
            error: 'INVITE_INVALID',
            message: 'Ссылка приглашения недействительна или истекла',
          });
        }
        if (tenantInvite.email && tenantInvite.email !== email) {
          return reply.code(400).send({
            error: 'INVITE_EMAIL_MISMATCH',
            message: 'Эта ссылка выдана для другого email',
          });
        }
      }

      const { password, name, tenantName } = request.body;
      const tenant = tenantInvite
        ? await app.prisma.tenant.findUniqueOrThrow({ where: { id: tenantInvite.tenantId } })
        : await app.prisma.tenant.create({
            data: { name: tenantName ?? `${email.split('@')[0]} workspace` },
          });
      const passwordHash = await hashPassword(password);
      const user = await app.prisma.user.create({
        data: {
          email,
          passwordHash,
          name: name ?? null,
          tenantId: tenant.id,
          emailVerifiedAt: null,
        },
      });
      if (tenantInvite) {
        await consumeTenantInvite(app.prisma, tenantInvite.id, user.id);
      }
      try {
        await sendVerificationEmailForUser(app.prisma, env, user.id, email, request.log);
      } catch (err) {
        request.log.error({ err, email }, 'verification email failed');
        return reply.code(503).send({
          error: 'EMAIL_SEND_FAILED',
          message:
            'Аккаунт создан, но письмо не отправлено. Настройте SMTP или запросите повторную отправку.',
        });
      }
      return reply.status(201).send({
        needsEmailVerification: true as const,
        email,
        message: 'Мы отправили ссылку для подтверждения на вашу почту.',
      });
    },
  );
  r.get(
    '/auth/tenant-invite',
    {
      schema: {
        querystring: z.object({ token: z.string().min(10) }),
        response: {
          200: z.object({
            valid: z.literal(true),
            email: z.string().nullable(),
            tenantName: z.string(),
            documentTitle: z.string().nullable(),
            documentRole: z.string().nullable(),
          }),
          404: authErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const invite = await findActiveTenantInvite(app.prisma, request.query.token);
      if (!invite) {
        return reply.code(404).send({
          error: 'INVITE_NOT_FOUND',
          message: 'Ссылка приглашения недействительна или истекла',
        });
      }
      return {
        valid: true as const,
        email: invite.email,
        tenantName: invite.tenant.name,
        documentTitle: invite.document?.title ?? null,
        documentRole: invite.documentRole,
      };
    },
  );
  r.post(
    '/auth/accept-tenant-invite',
    {
      preHandler: [app.authenticate],
      schema: {
        body: z.object({ inviteToken: z.string().min(10) }),
        response: {
          200: z.object({
            ok: z.literal(true),
            tenantId: z.string(),
            documentId: z.string().nullable(),
            token: z.string(),
            user: authUserSchema,
          }),
          400: authErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const user = request.user as JwtPayload;
      const result = await acceptTenantInviteForUser(
        app.prisma,
        request.body.inviteToken.trim(),
        user.sub,
      );
      if (!result.ok) {
        return reply.code(400).send({
          error: result.code,
          message: result.message,
        });
      }
      const updatedUser = await app.prisma.user.findUniqueOrThrow({ where: { id: user.sub } });
      const token = await issueAuthToken(reply, updatedUser);
      return {
        ok: true as const,
        tenantId: result.tenantId,
        documentId: result.documentId,
        token,
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          name: updatedUser.name,
          tenantId: updatedUser.tenantId,
          emailVerified: Boolean(updatedUser.emailVerifiedAt),
        },
      };
    },
  );
  r.get('/auth/verify-email', async (request, reply) => {
    const query = request.query as {
      token?: string;
    };
    const token = query.token?.trim() ?? '';
    if (!token) {
      return reply
        .type('text/html; charset=utf-8')
        .send(renderVerifyEmailHtmlPage('error', 'В ссылке нет токена.'));
    }
    const result = await verifyEmailWithToken(app.prisma, token);
    if (!result.ok) {
      return reply.type('text/html; charset=utf-8').send(renderVerifyEmailHtmlPage('error'));
    }
    return reply.type('text/html; charset=utf-8').send(renderVerifyEmailHtmlPage('success'));
  });
  r.post(
    '/auth/verify-email',
    {
      schema: {
        body: verifyEmailSchema,
        response: {
          200: z.object({ ok: z.literal(true) }),
          400: authErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await verifyEmailWithToken(app.prisma, request.body.token);
      if (!result.ok) {
        return reply.code(400).send({
          error: 'INVALID_TOKEN',
          message: 'Ссылка недействительна или устарела',
        });
      }
      return { ok: true as const };
    },
  );
  r.post(
    '/auth/resend-verification',
    {
      config: { rateLimit: AUTH_RESEND_VERIFICATION_RATE_LIMIT },
      schema: {
        body: resendVerificationSchema,
        response: {
          200: z.object({ ok: z.literal(true) }),
          503: authErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const email = normalizeEmail(request.body.email);
      const user = await app.prisma.user.findUnique({ where: { email } });
      if (!user || user.emailVerifiedAt) {
        return { ok: true as const };
      }
      try {
        await sendVerificationEmailForUser(app.prisma, env, user.id, email, request.log);
      } catch (err) {
        request.log.error({ err, email }, 'resend verification failed');
        return reply.code(503).send({
          error: 'EMAIL_SEND_FAILED',
          message: 'Не удалось отправить письмо. Попробуйте позже.',
        });
      }
      return { ok: true as const };
    },
  );
  r.post(
    '/auth/email-verification-status',
    {
      schema: {
        body: emailVerificationStatusSchema,
        response: {
          200: z.object({ verified: z.boolean() }),
        },
      },
    },
    async (request) => {
      const email = normalizeEmail(request.body.email);
      const user = await app.prisma.user.findUnique({
        where: { email },
        select: { emailVerifiedAt: true },
      });
      return { verified: Boolean(user?.emailVerifiedAt) };
    },
  );
  r.post(
    '/auth/login',
    {
      config: { rateLimit: AUTH_LOGIN_RATE_LIMIT },
      schema: {
        body: loginSchema,
        response: {
          200: z.object({
            token: z.string(),
            user: authUserSchema,
          }),
          400: authErrorSchema,
          401: authErrorSchema,
          403: authErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const captchaOk = await verifyTurnstileToken(request.body.captchaToken, request.ip, env);
      if (!captchaOk) {
        return reply.code(400).send({
          error: 'CAPTCHA_FAILED',
          message: 'Не пройдена проверка CAPTCHA',
        });
      }
      const email = normalizeEmail(request.body.email);
      const { password } = request.body;
      const user = await app.prisma.user.findUnique({ where: { email } });
      if (!user || !(await verifyPassword(password, user.passwordHash))) {
        return reply.code(401).send({
          error: 'INVALID_CREDENTIALS',
          message: 'Неверный email или пароль',
        });
      }
      if (!user.emailVerifiedAt) {
        return reply.code(403).send({
          error: 'EMAIL_NOT_VERIFIED',
          message: 'Подтвердите email по ссылке из письма или запросите повторную отправку.',
        });
      }
      const token = await issueAuthToken(reply, user);
      return {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          tenantId: user.tenantId,
          emailVerified: true,
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
          503: authErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const email = normalizeEmail(request.body.email);
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
          error: 'EMAIL_SEND_FAILED',
          message:
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
          400: authErrorSchema,
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
        return reply.code(400).send({
          error: 'INVALID_TOKEN',
          message: 'Ссылка для сброса пароля недействительна или устарела',
        });
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
  r.post(
    '/auth/magic-link',
    {
      config: { rateLimit: AUTH_MAGIC_LINK_RATE_LIMIT },
      schema: {
        body: magicLinkRequestSchema,
        response: {
          200: z.object({ ok: z.literal(true) }),
          400: authErrorSchema,
          503: authErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const captchaOk = await verifyTurnstileToken(request.body.captchaToken, request.ip, env);
      if (!captchaOk) {
        return reply.code(400).send({
          error: 'CAPTCHA_FAILED',
          message: 'Не пройдена проверка CAPTCHA',
        });
      }
      const emailCheck = await validateEmailForRegistration(request.body.email, { skipMx });
      if ('error' in emailCheck) {
        return reply.code(400).send({
          error: emailCheck.error.code,
          message: emailCheck.error.message,
        });
      }
      const email = emailCheck.email;
      const user = await findOrCreateUserForMagicLink(app.prisma, email);
      const { token, tokenHash, expiresAt } = createMagicLinkToken(env);
      await app.prisma.magicLinkToken.create({
        data: { userId: user.id, tokenHash, expiresAt },
      });
      const magicUrl = buildMagicLinkUrl(env, token);
      try {
        const mailer = createMailer(env, request.log);
        await mailer.sendMagicLinkEmail({ to: email, magicUrl });
      } catch (err) {
        request.log.error({ err, email }, 'magic link email failed');
        return reply.code(503).send({
          error: 'EMAIL_SEND_FAILED',
          message: 'Не удалось отправить письмо. Попробуйте позже.',
        });
      }
      return { ok: true as const };
    },
  );
  r.post(
    '/auth/phone/send-code',
    {
      config: { rateLimit: AUTH_MAGIC_LINK_RATE_LIMIT },
      schema: {
        body: sendCodeSchema,
        response: {
          200: z.object({ ok: z.literal(true) }),
          429: authErrorSchema,
        },
      },
    },
    async (request, _reply) => {
      const phone = request.body.phone.trim();
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const ttlMs = env.SMS_CODE_TTL_MINUTES * 60 * 1000;
      const expiresAt = new Date(Date.now() + ttlMs);
      await app.prisma.smsCode.create({
        data: { phone, code, expiresAt },
      });
      const sms = createSmsSender(env);
      await sms.sendCode(phone, code);
      return { ok: true as const };
    },
  );
  r.post(
    '/auth/phone/register',
    {
      schema: {
        body: phoneRegisterSchema,
        response: {
          200: z.object({ token: z.string(), user: authUserSchema }),
          400: authErrorSchema,
          409: authErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const phone = request.body.phone.trim();
      const code = request.body.code.trim();
      const existing = await app.prisma.user.findUnique({ where: { phone } });
      if (existing) {
        return reply.code(409).send({
          error: 'PHONE_ALREADY_REGISTERED',
          message: 'Этот номер уже зарегистрирован',
        });
      }
      const smsRecord = await app.prisma.smsCode.findFirst({
        where: { phone, code, usedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
      });
      if (!smsRecord) {
        return reply.code(400).send({
          error: 'INVALID_CODE',
          message: 'Неверный или устаревший код',
        });
      }
      await app.prisma.smsCode.update({
        where: { id: smsRecord.id },
        data: { usedAt: new Date() },
      });
      const tenant = await app.prisma.tenant.create({
        data: { name: request.body.name ?? `user-${phone}` },
      });
      const user = await app.prisma.user.create({
        data: {
          email: `${phone}@phone.folio-mind.app`,
          phone,
          passwordHash: await hashUnusablePassword(),
          name: request.body.name ?? null,
          tenantId: tenant.id,
          phoneVerifiedAt: new Date(),
          emailVerifiedAt: new Date(),
        },
      });
      const token = await issueAuthToken(reply, user);
      return {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          tenantId: user.tenantId,
          emailVerified: true,
        },
      };
    },
  );
  r.post(
    '/auth/phone/login',
    {
      schema: {
        body: phoneLoginSchema,
        response: {
          200: z.object({ token: z.string(), user: authUserSchema }),
          400: authErrorSchema,
          401: authErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const phone = request.body.phone.trim();
      const code = request.body.code.trim();
      const user = await app.prisma.user.findUnique({ where: { phone } });
      if (!user) {
        return reply.code(401).send({
          error: 'PHONE_NOT_REGISTERED',
          message: 'Этот номер не зарегистрирован',
        });
      }
      const smsRecord = await app.prisma.smsCode.findFirst({
        where: { phone, code, usedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
      });
      if (!smsRecord) {
        return reply.code(400).send({
          error: 'INVALID_CODE',
          message: 'Неверный или устаревший код',
        });
      }
      await app.prisma.smsCode.update({
        where: { id: smsRecord.id },
        data: { usedAt: new Date() },
      });
      if (!user.phoneVerifiedAt) {
        await app.prisma.user.update({
          where: { id: user.id },
          data: { phoneVerifiedAt: new Date() },
        });
      }
      const token = await issueAuthToken(reply, user);
      return {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          tenantId: user.tenantId,
          emailVerified: true,
        },
      };
    },
  );
  r.post(
    '/auth/magic-link/verify',
    {
      schema: {
        body: magicLinkVerifySchema,
        response: {
          200: z.object({
            ok: z.literal(true),
            token: z.string(),
            user: authUserSchema,
          }),
          400: authErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const token = request.body.token.trim();
      const tokenHash = sha256Hex(token);
      const record = await app.prisma.magicLinkToken.findUnique({
        where: { tokenHash },
        include: { user: true },
      });
      if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) {
        return reply.code(400).send({
          error: 'INVALID_TOKEN',
          message: 'Ссылка для входа недействительна или устарела',
        });
      }
      const verifiedAt = new Date();
      const user = await app.prisma.$transaction(async (tx) => {
        await tx.magicLinkToken.update({
          where: { id: record.id },
          data: { usedAt: verifiedAt },
        });
        return tx.user.update({
          where: { id: record.userId },
          data: {
            emailVerifiedAt: record.user.emailVerifiedAt ?? verifiedAt,
          },
        });
      });
      const jwt = await issueAuthToken(reply, user);
      return {
        ok: true as const,
        token: jwt,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          tenantId: user.tenantId,
          emailVerified: true,
        },
      };
    },
  );
};
