import type { FastifyReply } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { DocumentCapability } from '@folio-mind/pdf-contracts';
import {
  resolveDocumentAccess,
  type DocumentAccessResult,
  type DocumentWithAccess,
} from './document-permissions.js';

export function getAuthUser(request: { user: unknown }) {
  return request.user as {
    sub: string;
    email: string;
    tenantId: string;
  };
}

export async function findDocumentForUser(
  prisma: Pick<PrismaClient, 'document'>,
  documentId: string,
  user: {
    sub: string;
    tenantId: string;
  },
  options?: { capability?: DocumentCapability },
): Promise<DocumentWithAccess | null> {
  const access = await resolveDocumentAccess(
    prisma,
    documentId,
    user,
    options?.capability ?? 'view',
  );
  if (!access.ok) return null;
  return access.document;
}

export async function requireDocumentAccess(
  prisma: Pick<PrismaClient, 'document'>,
  documentId: string,
  user: { sub: string; tenantId: string },
  capability: DocumentCapability = 'view',
): Promise<DocumentAccessResult> {
  return resolveDocumentAccess(prisma, documentId, user, capability);
}

export function replyDocumentAccessError(
  reply: FastifyReply,
  result: Extract<DocumentAccessResult, { ok: false }>,
) {
  if (result.reason === 'forbidden') {
    return reply.code(403).send({ error: 'Недостаточно прав для этой операции' });
  }
  return reply.code(404).send({ error: 'Document not found' });
}

export type { DocumentWithAccess };
