import { RAG_EMBEDDING_DIM, embedTextLocal } from './rag-embeddings.js';

export type EmbeddingSource = 'provider' | 'local';

export type ResolvedEmbedding = {
  values: number[];
  source: EmbeddingSource;
};

export async function resolveEmbeddingVector(
  text: string,
  embed?: (input: string) => Promise<number[]>,
): Promise<ResolvedEmbedding> {
  if (embed) {
    try {
      const values = await embed(text);
      if (Array.isArray(values) && values.length === RAG_EMBEDDING_DIM) {
        return { values, source: 'provider' };
      }
    } catch {
      // Provider failures must not break RAG — fall back to local.
    }
  }
  return { values: embedTextLocal(text), source: 'local' };
}
