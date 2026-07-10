import type { Prisma, PrismaClient } from '@prisma/client';
import {
  type DocumentAccessRole,
  type DocumentCapability,
  type DocumentMemberRole,
  isDocumentMemberRole,
  roleHasCapability,
} from '@folio-mind/pdf-contracts';

export const documentInclude = {
  project: { select: { name: true } },
  owner: { select: { id: true, email: true, name: true } },
  versions: { orderBy: { version: 'desc' as const } },
  members: {
    select: {
      userId: true,
      role: true,
      createdAt: true,
      user: { select: { id: true, email: true, name: true } },
    },
  },
} satisfies Prisma.DocumentInclude;

export type DocumentWithAccess = Prisma.DocumentGetPayload<{
  include: typeof documentInclude;
}>;

export type DocumentAccessResult =
  | { ok: true; document: DocumentWithAccess; role: DocumentAccessRole }
  | { ok: false; reason: 'not_found' | 'forbidden' };

export async function resolveDocumentAccess(
  prisma: Pick<PrismaClient, 'document'>,
  documentId: string,
  user: { sub: string; tenantId: string },
  requiredCapability: DocumentCapability = 'view',
): Promise<DocumentAccessResult> {
  const document = await prisma.document.findFirst({
    where: {
      id: documentId,
      tenantId: user.tenantId,
      OR: [{ ownerId: user.sub }, { members: { some: { userId: user.sub } } }],
    },
    include: documentInclude,
  });

  if (!document) {
    return { ok: false, reason: 'not_found' };
  }

  const role = resolveUserDocumentRole(document, user.sub);
  if (!roleHasCapability(role, requiredCapability)) {
    return { ok: false, reason: 'forbidden' };
  }

  return { ok: true, document, role };
}

export function resolveUserDocumentRole(
  document: { ownerId: string; members: { userId: string; role: string }[] },
  userId: string,
): DocumentAccessRole {
  if (document.ownerId === userId) return 'owner';
  const member = document.members.find((m) => m.userId === userId);
  if (member && isDocumentMemberRole(member.role)) {
    return member.role;
  }
  return 'viewer';
}

export function parseMemberRole(role: string): DocumentMemberRole | null {
  return isDocumentMemberRole(role) ? role : null;
}
