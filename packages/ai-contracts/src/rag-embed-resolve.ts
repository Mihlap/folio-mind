import { RAG_EMBEDDING_DIM, embedTextLocal } from './rag-embeddings.js';

export type EmbeddingSource = 'provider' | 'local';

export type ResolvedEmbedding = {
  values: number[];
  source: EmbeddingSource;
};

/**
 * Resolve a fixed-size embedding for RAG.
 * Provider vectors are used only when dim matches pgvector(384); otherwise local fallback.
 * Keeps index and search compatible when credentials/dim differ.
 */
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
