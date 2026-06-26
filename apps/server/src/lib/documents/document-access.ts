import type { FastifyRequest } from 'fastify';
export function getAuthUser(request: FastifyRequest) {
  return request.user as {
    sub: string;
    email: string;
    tenantId: string;
  };
}
export async function findDocumentForUser(
  prisma: {
    document: {
      findFirst: Function;
    };
  },
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
    include: { versions: { orderBy: { version: 'desc' } } },
  });
}
