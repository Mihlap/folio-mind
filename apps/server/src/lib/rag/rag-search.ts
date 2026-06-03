import type { PrismaClient } from '@prisma/client';
import { extractRagSearchTerms } from '@folio-mind/ai-contracts';

const chunkInclude = { source: { select: { id: true, title: true } } } as const;

export async function searchRagChunks(
  prisma: PrismaClient,
  tenantId: string,
  query: string,
  limit = 8,
) {
  const terms = extractRagSearchTerms(query, 6);

  if (terms.length > 0) {
    const matched = await prisma.ragChunk.findMany({
      where: {
        tenantId,
        source: { status: 'ready' },
        OR: terms.map((term) => ({
          content: { contains: term, mode: 'insensitive' as const },
        })),
      },
      take: limit,
      include: chunkInclude,
    });
    if (matched.length > 0) return matched;
  }

  return prisma.ragChunk.findMany({
    where: { tenantId, source: { status: 'ready' } },
    orderBy: [{ sourceId: 'asc' }, { chunkIndex: 'asc' }],
    take: limit,
    include: chunkInclude,
  });
}
