import type { PrismaClient } from '@prisma/client';
import {
  embedTextLocal,
  embeddingToPgVector,
  extractRagSearchTerms,
} from '@folio-mind/ai-contracts';
const chunkInclude = { source: { select: { id: true, title: true } } } as const;
export type RagChunkHit = {
  id: string;
  sourceId: string;
  chunkIndex: number;
  content: string;
  source: {
    id: string;
    title: string;
  };
};
async function searchRagChunksByVector(
  prisma: PrismaClient,
  tenantId: string,
  query: string,
  limit: number,
): Promise<RagChunkHit[] | null> {
  const vectorLiteral = embeddingToPgVector(embedTextLocal(query));
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      sourceId: string;
      chunkIndex: number;
      content: string;
      source_id: string;
      source_title: string;
    }>
  >(
    `SELECT c.id, c."sourceId", c."chunkIndex", c.content,
            s.id AS source_id, s.title AS source_title
     FROM "RagChunk" c
     INNER JOIN "RagSource" s ON s.id = c."sourceId"
     WHERE c."tenantId" = $1
       AND s.status = 'ready'
       AND c.embedding IS NOT NULL
     ORDER BY c.embedding <=> $2::vector
     LIMIT $3`,
    tenantId,
    vectorLiteral,
    limit,
  );
  if (rows.length === 0) return null;
  return rows.map((row) => ({
    id: row.id,
    sourceId: row.sourceId,
    chunkIndex: row.chunkIndex,
    content: row.content,
    source: { id: row.source_id, title: row.source_title },
  }));
}
async function searchRagChunksByKeyword(
  prisma: PrismaClient,
  tenantId: string,
  query: string,
  limit: number,
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
export async function searchRagChunks(
  prisma: PrismaClient,
  tenantId: string,
  query: string,
  limit = 8,
): Promise<RagChunkHit[]> {
  try {
    const vectorHits = await searchRagChunksByVector(prisma, tenantId, query, limit);
    if (vectorHits && vectorHits.length > 0) return vectorHits;
  } catch {}
  return searchRagChunksByKeyword(prisma, tenantId, query, limit);
}
