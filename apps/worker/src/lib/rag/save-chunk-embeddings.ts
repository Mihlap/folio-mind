import {
  embeddingToPgVector,
  resolveEmbeddingVector,
  type EmbeddingSource,
} from '@folio-mind/ai-contracts';
import type { LLMProvider } from '@folio-mind/ai-providers';

type PrismaLike = {
  $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<unknown>;
};

export async function saveChunkEmbeddings(
  prisma: PrismaLike,
  table: '"RagChunk"' | '"DocumentChunk"',
  rows: Array<{ id: string; content: string }>,
  provider?: LLMProvider | null,
): Promise<{ providerCount: number; localCount: number }> {
  const embed = provider?.embed != null ? (text: string) => provider.embed!(text) : undefined;

  let providerCount = 0;
  let localCount = 0;

  for (const row of rows) {
    const resolved = await resolveEmbeddingVector(row.content, embed);
    if (resolved.source === 'provider') providerCount += 1;
    else localCount += 1;
    const vectorLiteral = embeddingToPgVector(resolved.values);
    await prisma.$executeRawUnsafe(
      `UPDATE ${table} SET embedding = $1::vector WHERE id = $2`,
      vectorLiteral,
      row.id,
    );
  }

  return { providerCount, localCount };
}

export type { EmbeddingSource };
