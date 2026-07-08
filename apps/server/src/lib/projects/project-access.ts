import type { PrismaClient } from '@prisma/client';

export async function findProjectForTenant(
  prisma: Pick<PrismaClient, 'project'>,
  projectId: string,
  tenantId: string,
) {
  return prisma.project.findFirst({
    where: { id: projectId, tenantId },
  });
}
