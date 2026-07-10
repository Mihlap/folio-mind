import { randomBytes } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { Env } from '../config/env.js';
import { sha256Hex } from '../auth/password-reset.js';

export const TENANT_INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export type TenantInviteToken = {
  token: string;
  tokenHash: string;
  expiresAt: Date;
};

export function createTenantInviteToken(): TenantInviteToken {
  const token = randomBytes(32).toString('base64url');
  return {
    token,
    tokenHash: sha256Hex(token),
    expiresAt: new Date(Date.now() + TENANT_INVITE_TTL_MS),
  };
}

export function hashTenantInviteToken(token: string): string {
  return sha256Hex(token);
}

export function buildTenantInviteRegisterUrl(env: Env, token: string): string {
  const base = env.FRONTEND_URL.replace(/\/+$/, '');
  return `${base}/register?invite=${encodeURIComponent(token)}`;
}

export function resolveTenantInviteRegisterUrl(
  env: Env,
  tokenCipher: string | null | undefined,
  decrypt: (payload: string, secret: string) => string | null,
  secret: string,
): string | null {
  if (!tokenCipher) return null;
  const token = decrypt(tokenCipher, secret);
  if (!token) return null;
  return buildTenantInviteRegisterUrl(env, token);
}

export function isTenantInviteActive(invite: {
  expiresAt: Date;
  usedAt: Date | null;
}): boolean {
  if (invite.usedAt) return false;
  return invite.expiresAt.getTime() > Date.now();
}

export async function findActiveTenantInvite(prisma: PrismaClient, token: string) {
  const invite = await prisma.tenantInvite.findUnique({
    where: { tokenHash: hashTenantInviteToken(token) },
    include: {
      tenant: { select: { id: true, name: true } },
      document: { select: { id: true, title: true, tenantId: true } },
    },
  });
  if (!invite || invite.usedAt || invite.expiresAt.getTime() <= Date.now()) {
    return null;
  }
  return invite;
}

export async function consumeTenantInvite(
  prisma: PrismaClient,
  inviteId: string,
  userId: string,
): Promise<void> {
  const invite = await prisma.tenantInvite.findUnique({ where: { id: inviteId } });
  if (!invite || invite.usedAt) return;

  await prisma.$transaction(async (tx) => {
    await tx.tenantInvite.update({
      where: { id: inviteId },
      data: { usedAt: new Date() },
    });

    if (invite.documentId && invite.documentRole) {
      await tx.documentMember.upsert({
        where: {
          documentId_userId: {
            documentId: invite.documentId,
            userId,
          },
        },
        create: {
          documentId: invite.documentId,
          userId,
          role: invite.documentRole,
        },
        update: { role: invite.documentRole },
      });
    }
  });
}

export type AcceptTenantInviteResult =
  | { ok: true; tenantId: string; documentId: string | null }
  | { ok: false; code: string; message: string };

export async function acceptTenantInviteForUser(
  prisma: PrismaClient,
  inviteToken: string,
  userId: string,
): Promise<AcceptTenantInviteResult> {
  const invite = await findActiveTenantInvite(prisma, inviteToken);
  if (!invite) {
    return {
      ok: false,
      code: 'INVITE_INVALID',
      message: 'Ссылка приглашения недействительна или истекла',
    };
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return { ok: false, code: 'USER_NOT_FOUND', message: 'Пользователь не найден' };
  }

  if (invite.email && invite.email !== user.email) {
    return {
      ok: false,
      code: 'INVITE_EMAIL_MISMATCH',
      message: 'Эта ссылка выдана для другого email',
    };
  }

  if (user.tenantId !== invite.tenantId) {
    const ownedDocuments = await prisma.document.count({ where: { ownerId: userId } });
    if (ownedDocuments > 0) {
      return {
        ok: false,
        code: 'USER_HAS_OWN_DOCUMENTS',
        message:
          'У этого аккаунта уже есть свои документы в другом рабочем пространстве. Зарегистрируйте новый аккаунт по ссылке или попросите гостевую ссылку на документ.',
      };
    }

    await prisma.user.update({
      where: { id: userId },
      data: { tenantId: invite.tenantId },
    });
  }

  await consumeTenantInvite(prisma, invite.id, userId);

  return {
    ok: true,
    tenantId: invite.tenantId,
    documentId: invite.documentId,
  };
}
