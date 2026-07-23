import type { PrismaClient } from '@prisma/client';
import {
  embeddingToPgVector,
  extractRagSearchTerms,
  resolveEmbeddingVector,
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

export type RagSearchOptions = {
  limit?: number;
  embed?: (text: string) => Promise<number[]>;
};

function dedupeHits(hits: RagChunkHit[], limit: number): RagChunkHit[] {
  const seen = new Set<string>();
  const out: RagChunkHit[] = [];
  for (const hit of hits) {
    if (seen.has(hit.id)) continue;
    seen.add(hit.id);
    out.push(hit);
    if (out.length >= limit) break;
  }
  return out;
}

async function searchRagChunksByVector(
  prisma: PrismaClient,
  tenantId: string,
  query: string,
  limit: number,
  embed?: (text: string) => Promise<number[]>,
): Promise<RagChunkHit[] | null> {
  const { values } = await resolveEmbeddingVector(query, embed);
  const vectorLiteral = embeddingToPgVector(values);
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

async function searchRagChunksByKeywordTerms(
  prisma: PrismaClient,
  tenantId: string,
  query: string,
  limit: number,
): Promise<RagChunkHit[]> {
  const terms = extractRagSearchTerms(query, 6);
  if (terms.length === 0) return [];
  return prisma.ragChunk.findMany({
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
}

async function searchRagChunksAny(
  prisma: PrismaClient,
  tenantId: string,
  limit: number,
): Promise<RagChunkHit[]> {
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
  limitOrOptions: number | RagSearchOptions = 8,
): Promise<RagChunkHit[]> {
  const options: RagSearchOptions =
    typeof limitOrOptions === 'number' ? { limit: limitOrOptions } : limitOrOptions;
  const limit = options.limit ?? 8;

  const keywordHits = await searchRagChunksByKeywordTerms(prisma, tenantId, query, limit);

  let vectorHits: RagChunkHit[] = [];
  try {
    const hits = await searchRagChunksByVector(
      prisma,
      tenantId,
      query,
      limit,
      options.embed,
    );
    if (hits) vectorHits = hits;
  } catch {
    // Vector search is optional; keyword/any fallback keeps RAG usable.
  }

  const merged = dedupeHits([...keywordHits, ...vectorHits], limit);
  if (merged.length > 0) return merged;
  return searchRagChunksAny(prisma, tenantId, limit);
}
