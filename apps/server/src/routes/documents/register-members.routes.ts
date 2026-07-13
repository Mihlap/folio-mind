import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { DOCUMENT_MEMBER_ROLES, isDocumentMemberRole } from '@folio-mind/pdf-contracts';
import type { Env } from '../../lib/config/env.js';
import {
  getAuthUser,
  requireDocumentAccess,
  replyDocumentAccessError,
} from '../../lib/documents/document-access.js';
import { resolveUserDocumentRole } from '../../lib/documents/document-permissions.js';
import { normalizeEmail } from '../../lib/email/email.js';
import {
  buildTenantInviteRegisterUrl,
  createTenantInviteToken,
  isTenantInviteActive,
  resolveTenantInviteRegisterUrl,
} from '../../lib/tenant/tenant-invite.js';
import { encryptShareToken, decryptShareToken } from '../../lib/share/share-token-cipher.js';
import { publishMemberAccessDocumentEvent } from '../../lib/events/document-events-bus.js';
import { errorBody } from './schemas.js';

const memberRoleSchema = z.enum(DOCUMENT_MEMBER_ROLES);

const memberSchema = z.object({
  userId: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  role: memberRoleSchema,
  createdAt: z.string(),
});

const ownerSchema = z.object({
  userId: z.string(),
  email: z.string(),
  name: z.string().nullable(),
});

const pendingInviteSchema = z.object({
  id: z.string(),
  email: z.string().nullable(),
  role: memberRoleSchema,
  expiresAt: z.string(),
  createdAt: z.string(),
  inviteUrl: z.string().nullable(),
  active: z.boolean(),
});

function mapPendingInvite(
  invite: {
    id: string;
    email: string | null;
    documentRole: string | null;
    expiresAt: Date;
    createdAt: Date;
    usedAt: Date | null;
    tokenCipher: string | null;
  },
  env: Env,
) {
  const role =
    invite.documentRole && isDocumentMemberRole(invite.documentRole)
      ? invite.documentRole
      : 'editor';
  const active = isTenantInviteActive(invite);
  return {
    id: invite.id,
    email: invite.email,
    role,
    expiresAt: invite.expiresAt.toISOString(),
    createdAt: invite.createdAt.toISOString(),
    inviteUrl: active
      ? resolveTenantInviteRegisterUrl(env, invite.tokenCipher, decryptShareToken, env.JWT_SECRET)
      : null,
    active,
  };
}

export const registerMembersRoutes: FastifyPluginAsync<{ env: Env }> = async (app, opts) => {
  const { env } = opts;
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/documents/:documentId/members',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ documentId: z.string() }),
        response: {
          200: z.object({
            myRole: z.string(),
            owner: ownerSchema,
            members: z.array(memberSchema),
          }),
          403: errorBody,
          404: errorBody,
        },
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const access = await requireDocumentAccess(
        app.prisma,
        request.params.documentId,
        user,
        'manage_members',
      );
      if (!access.ok) return replyDocumentAccessError(reply, access);

      const { document } = access;
      const myRole = resolveUserDocumentRole(document, user.sub);
      const owner = document.owner;

      return {
        myRole,
        owner: {
          userId: owner.id,
          email: owner.email,
          name: owner.name,
        },
        members: document.members.map((m) => ({
          userId: m.userId,
          email: m.user.email,
          name: m.user.name,
          role: m.role as z.infer<typeof memberRoleSchema>,
          createdAt: m.createdAt.toISOString(),
        })),
      };
    },
  );

  r.post(
    '/documents/:documentId/members',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ documentId: z.string() }),
        body: z.object({
          email: z.string().email(),
          role: memberRoleSchema,
        }),
        response: {
          201: memberSchema,
          400: errorBody,
          403: errorBody,
          404: errorBody,
        },
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const access = await requireDocumentAccess(
        app.prisma,
        request.params.documentId,
        user,
        'manage_members',
      );
      if (!access.ok) return replyDocumentAccessError(reply, access);

      const email = normalizeEmail(request.body.email);
      const targetUser = await app.prisma.user.findUnique({ where: { email } });
      if (!targetUser) {
        return reply.code(400).send({
          error:
            'Пользователь с таким email ещё не в вашем рабочем пространстве. Отправьте ссылку для присоединения.',
          code: 'USER_NOT_IN_TENANT',
        });
      }
      if (targetUser.tenantId !== user.tenantId) {
        return reply.code(400).send({
          error:
            'Этот email уже зарегистрирован в другом рабочем пространстве. Отправьте ссылку для присоединения — коллега войдёт и попадёт к вам.',
          code: 'USER_IN_OTHER_TENANT',
        });
      }
      if (targetUser.id === access.document.ownerId) {
        return reply.code(400).send({ error: 'Владелец уже имеет полный доступ' });
      }
      if (targetUser.id === user.sub && access.document.ownerId !== user.sub) {
        return reply.code(403).send({ error: 'Нельзя изменить свою роль через этот интерфейс' });
      }

      const existingMember = await app.prisma.documentMember.findUnique({
        where: {
          documentId_userId: {
            documentId: access.document.id,
            userId: targetUser.id,
          },
        },
      });

      const member = await app.prisma.documentMember.upsert({
        where: {
          documentId_userId: {
            documentId: access.document.id,
            userId: targetUser.id,
          },
        },
        create: {
          documentId: access.document.id,
          userId: targetUser.id,
          role: request.body.role,
        },
        update: { role: request.body.role },
        include: { user: { select: { email: true, name: true } } },
      });

      await app.prisma.auditLog.create({
        data: {
          action: 'document.member_upsert',
          userId: user.sub,
          tenantId: user.tenantId,
          documentId: access.document.id,
          meta: { memberUserId: targetUser.id, role: request.body.role },
        },
      });

      await app.prisma.tenantInvite.deleteMany({
        where: { documentId: access.document.id, email, usedAt: null },
      });

      void publishMemberAccessDocumentEvent(
        env,
        access.document.id,
        targetUser.id,
        existingMember ? 'role_changed' : 'added',
        request.body.role,
      ).catch((err) => {
        request.log.warn({ err }, 'member access event publish failed');
      });

      return reply.code(201).send({
        userId: member.userId,
        email: member.user.email,
        name: member.user.name,
        role: member.role as z.infer<typeof memberRoleSchema>,
        createdAt: member.createdAt.toISOString(),
      });
    },
  );

  r.post(
    '/documents/:documentId/members/invite-link',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ documentId: z.string() }),
        body: z.object({
          email: z.string().email(),
          role: memberRoleSchema,
        }),
        response: {
          201: z.object({
            id: z.string(),
            inviteUrl: z.string(),
            expiresAt: z.string(),
          }),
          400: errorBody,
          403: errorBody,
          404: errorBody,
        },
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const access = await requireDocumentAccess(
        app.prisma,
        request.params.documentId,
        user,
        'manage_members',
      );
      if (!access.ok) return replyDocumentAccessError(reply, access);

      const email = normalizeEmail(request.body.email);
      const existingInTenant = await app.prisma.user.findFirst({
        where: { email, tenantId: user.tenantId },
      });
      if (existingInTenant) {
        return reply.code(400).send({
          error: 'Этот пользователь уже в вашем рабочем пространстве — добавьте его кнопкой «Пригласить».',
          code: 'USER_ALREADY_IN_TENANT',
        });
      }

      const { token, tokenHash, expiresAt } = createTenantInviteToken();
      const tokenCipher = encryptShareToken(token, opts.env.JWT_SECRET);

      await app.prisma.tenantInvite.deleteMany({
        where: {
          documentId: access.document.id,
          email,
          usedAt: null,
        },
      });

      const invite = await app.prisma.tenantInvite.create({
        data: {
          tenantId: user.tenantId,
          tokenHash,
          tokenCipher,
          email,
          documentId: access.document.id,
          documentRole: request.body.role,
          createdById: user.sub,
          expiresAt,
        },
      });

      return reply.code(201).send({
        id: invite.id,
        inviteUrl: buildTenantInviteRegisterUrl(opts.env, token),
        expiresAt: expiresAt.toISOString(),
      });
    },
  );

  r.get(
    '/documents/:documentId/members/pending-invites',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ documentId: z.string() }),
        response: {
          200: z.object({ items: z.array(pendingInviteSchema) }),
          403: errorBody,
          404: errorBody,
        },
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const access = await requireDocumentAccess(
        app.prisma,
        request.params.documentId,
        user,
        'manage_members',
      );
      if (!access.ok) return replyDocumentAccessError(reply, access);

      const invites = await app.prisma.tenantInvite.findMany({
        where: { documentId: access.document.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });

      return {
        items: invites.map((invite) => mapPendingInvite(invite, opts.env)),
      };
    },
  );

  r.patch(
    '/documents/:documentId/members/pending-invites/:inviteId',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ documentId: z.string(), inviteId: z.string() }),
        body: z.object({ role: memberRoleSchema }),
        response: {
          200: pendingInviteSchema,
          400: errorBody,
          403: errorBody,
          404: errorBody,
        },
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const access = await requireDocumentAccess(
        app.prisma,
        request.params.documentId,
        user,
        'manage_members',
      );
      if (!access.ok) return replyDocumentAccessError(reply, access);

      const existing = await app.prisma.tenantInvite.findFirst({
        where: {
          id: request.params.inviteId,
          documentId: access.document.id,
        },
      });
      if (!existing) {
        return reply.code(404).send({ error: 'Приглашение не найдено' });
      }
      if (!isTenantInviteActive(existing)) {
        return reply.code(400).send({ error: 'Приглашение уже использовано или истекло' });
      }

      const updated = await app.prisma.tenantInvite.update({
        where: { id: existing.id },
        data: { documentRole: request.body.role },
      });

      return mapPendingInvite(updated, opts.env);
    },
  );

  r.delete(
    '/documents/:documentId/members/pending-invites/:inviteId',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ documentId: z.string(), inviteId: z.string() }),
        response: {
          204: z.null(),
          403: errorBody,
          404: errorBody,
        },
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const access = await requireDocumentAccess(
        app.prisma,
        request.params.documentId,
        user,
        'manage_members',
      );
      if (!access.ok) return replyDocumentAccessError(reply, access);

      const existing = await app.prisma.tenantInvite.findFirst({
        where: {
          id: request.params.inviteId,
          documentId: access.document.id,
        },
      });
      if (!existing) {
        return reply.code(404).send({ error: 'Приглашение не найдено' });
      }

      await app.prisma.tenantInvite.delete({ where: { id: existing.id } });
      return reply.code(204).send(null);
    },
  );

  r.patch(
    '/documents/:documentId/members/:memberUserId',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ documentId: z.string(), memberUserId: z.string() }),
        body: z.object({ role: memberRoleSchema }),
        response: {
          200: memberSchema,
          403: errorBody,
          404: errorBody,
        },
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const access = await requireDocumentAccess(
        app.prisma,
        request.params.documentId,
        user,
        'manage_members',
      );
      if (!access.ok) return replyDocumentAccessError(reply, access);

      const existing = await app.prisma.documentMember.findUnique({
        where: {
          documentId_userId: {
            documentId: access.document.id,
            userId: request.params.memberUserId,
          },
        },
        include: { user: { select: { email: true, name: true } } },
      });
      if (!existing) {
        return reply.code(404).send({ error: 'Участник не найден' });
      }

      const updated = await app.prisma.documentMember.update({
        where: { id: existing.id },
        data: { role: request.body.role },
        include: { user: { select: { email: true, name: true } } },
      });

      if (existing.role !== request.body.role) {
        void publishMemberAccessDocumentEvent(
          env,
          access.document.id,
          updated.userId,
          'role_changed',
          request.body.role,
        ).catch((err) => {
          request.log.warn({ err }, 'member access event publish failed');
        });
      }

      return {
        userId: updated.userId,
        email: updated.user.email,
        name: updated.user.name,
        role: updated.role as z.infer<typeof memberRoleSchema>,
        createdAt: updated.createdAt.toISOString(),
      };
    },
  );

  r.delete(
    '/documents/:documentId/members/:memberUserId',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ documentId: z.string(), memberUserId: z.string() }),
        response: {
          204: z.null(),
          403: errorBody,
          404: errorBody,
        },
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const access = await requireDocumentAccess(
        app.prisma,
        request.params.documentId,
        user,
        'manage_members',
      );
      if (!access.ok) return replyDocumentAccessError(reply, access);

      const existing = await app.prisma.documentMember.findUnique({
        where: {
          documentId_userId: {
            documentId: access.document.id,
            userId: request.params.memberUserId,
          },
        },
      });
      if (!existing) {
        return reply.code(404).send({ error: 'Участник не найден' });
      }

      await app.prisma.documentMember.delete({ where: { id: existing.id } });
      await app.prisma.auditLog.create({
        data: {
          action: 'document.member_remove',
          userId: user.sub,
          tenantId: user.tenantId,
          documentId: access.document.id,
          meta: { memberUserId: request.params.memberUserId },
        },
      });

      void publishMemberAccessDocumentEvent(
        env,
        access.document.id,
        request.params.memberUserId,
        'removed',
      ).catch((err) => {
        request.log.warn({ err }, 'member access event publish failed');
      });

      return reply.code(204).send(null);
    },
  );

  r.get(
    '/tenant/users',
    {
      preHandler: [app.authenticate],
      schema: {
        querystring: z.object({ q: z.string().optional() }),
        response: {
          200: z.object({
            items: z.array(
              z.object({
                id: z.string(),
                email: z.string(),
                name: z.string().nullable(),
              }),
            ),
          }),
        },
      },
    },
    async (request) => {
      const user = getAuthUser(request);
      const q = request.query.q?.trim().toLowerCase();
      const users = await app.prisma.user.findMany({
        where: {
          tenantId: user.tenantId,
          id: { not: user.sub },
          ...(q
            ? {
                OR: [
                  { email: { contains: q, mode: 'insensitive' as const } },
                  { name: { contains: q, mode: 'insensitive' as const } },
                ],
              }
            : {}),
        },
        select: { id: true, email: true, name: true },
        orderBy: { email: 'asc' },
        take: 30,
      });
      return { items: users };
    },
  );
};
