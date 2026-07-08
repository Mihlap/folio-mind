import { getPrisma } from '../infra/prisma.js';
import type { Prisma } from '@prisma/client';

export async function reportOptimizeProgress(
  operationJobId: string,
  label: string,
  step?: number,
  total?: number,
): Promise<void> {
  const prisma = getPrisma();
  const job = await prisma.job.findUnique({
    where: { id: operationJobId },
    select: { payload: true },
  });
  const payload = (job?.payload ?? {}) as Record<string, unknown>;
  const progress: { label: string; step?: number; total?: number } = { label };
  if (step !== undefined && total !== undefined) {
    progress.step = step;
    progress.total = total;
  }
  await prisma.job.update({
    where: { id: operationJobId },
    data: {
      payload: { ...payload, progress } as Prisma.InputJsonValue,
    },
  });
}
