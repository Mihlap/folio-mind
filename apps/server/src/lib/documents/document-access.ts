import type { FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
export function getAuthUser(request: FastifyRequest) {
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
) {
  return prisma.document.findFirst({
    where: {
      id: documentId,
      tenantId: user.tenantId,
      ownerId: user.sub,
    },
    include: {
      project: { select: { name: true } },
      versions: { orderBy: { version: 'desc' } },
    },
  });
}
