import type { PrismaClient } from '@prisma/client';
import {
  embeddingToPgVector,
  extractRagSearchTerms,
  resolveEmbeddingVector,
} from '@folio-mind/ai-contracts';

export type DocumentChunkHit = {
  id: string;
  chunkIndex: number;
  page: number | null;
  content: string;
};

export type DocumentChunkSearchOptions = {
  limit?: number;
  embed?: (text: string) => Promise<number[]>;
};

export async function countDocumentChunks(
  prisma: PrismaClient,
  versionId: string,
): Promise<number> {
  return prisma.documentChunk.count({ where: { versionId } });
}

function dedupeHits(hits: DocumentChunkHit[], limit: number): DocumentChunkHit[] {
  const seen = new Set<string>();
  const out: DocumentChunkHit[] = [];
  for (const hit of hits) {
    if (seen.has(hit.id)) continue;
    seen.add(hit.id);
    out.push(hit);
    if (out.length >= limit) break;
  }
  return out;
}

async function searchByKeyword(
  prisma: PrismaClient,
  versionId: string,
  query: string,
  limit: number,
): Promise<DocumentChunkHit[]> {
  const terms = extractRagSearchTerms(query, 8);
  if (terms.length === 0) return [];
  const candidates = await prisma.documentChunk.findMany({
    where: {
      versionId,
      OR: terms.map((term) => ({
        content: { contains: term, mode: 'insensitive' as const },
      })),
    },
    take: Math.max(limit * 8, 32),
    orderBy: { chunkIndex: 'asc' },
    select: { id: true, chunkIndex: true, page: true, content: true },
  });
  const scored = candidates
    .map((hit) => {
      const lower = hit.content.toLowerCase();
      const score = terms.reduce((sum, term) => (lower.includes(term) ? sum + 1 : sum), 0);
      return { hit, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.hit.chunkIndex - b.hit.chunkIndex);
  return scored.slice(0, limit).map((row) => row.hit);
}

async function searchByVector(
  prisma: PrismaClient,
  versionId: string,
  query: string,
  limit: number,
  embed?: (text: string) => Promise<number[]>,
): Promise<DocumentChunkHit[]> {
  const { values } = await resolveEmbeddingVector(query, embed);
  const vectorLiteral = embeddingToPgVector(values);
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      chunkIndex: number;
      page: number | null;
      content: string;
    }>
  >(
    `SELECT id, "chunkIndex", page, content
     FROM "DocumentChunk"
     WHERE "versionId" = $1
       AND embedding IS NOT NULL
     ORDER BY embedding <=> $2::vector
     LIMIT $3`,
    versionId,
    vectorLiteral,
    limit,
  );
  return rows.map((row) => ({
    id: row.id,
    chunkIndex: row.chunkIndex,
    page: row.page,
    content: row.content,
  }));
}

/**
 * Hybrid search по чанкам версии документа: keyword (приоритет) + vector.
 * Без keyword локальные FNV-эмбеддинги часто дают случайный top-k на однотипных страницах.
 */
export async function searchDocumentChunks(
  prisma: PrismaClient,
  versionId: string,
  query: string,
  options: DocumentChunkSearchOptions = {},
): Promise<DocumentChunkHit[]> {
  const limit = options.limit ?? 8;

  const keywordHits = await searchByKeyword(prisma, versionId, query, limit);

  let vectorHits: DocumentChunkHit[] = [];
  try {
    vectorHits = await searchByVector(prisma, versionId, query, limit, options.embed);
  } catch {
    // Vector optional.
  }

  const merged = dedupeHits([...keywordHits, ...vectorHits], limit);
  if (merged.length > 0) return merged;

  return prisma.documentChunk.findMany({
    where: { versionId },
    orderBy: { chunkIndex: 'asc' },
    take: limit,
    select: { id: true, chunkIndex: true, page: true, content: true },
  });
}
