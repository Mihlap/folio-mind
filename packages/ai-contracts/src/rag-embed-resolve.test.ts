import { describe, expect, it, vi } from 'vitest';
import { RAG_EMBEDDING_DIM } from './rag-embeddings.js';
import { resolveEmbeddingVector } from './rag-embed-resolve.js';

describe('resolveEmbeddingVector', () => {
  it('uses local when no provider embed is given', async () => {
    const result = await resolveEmbeddingVector('договор аренды');
    expect(result.source).toBe('local');
    expect(result.values).toHaveLength(RAG_EMBEDDING_DIM);
  });

  it('uses provider when dimension matches', async () => {
    const values = Array.from({ length: RAG_EMBEDDING_DIM }, (_, i) => (i === 0 ? 1 : 0));
    const embed = vi.fn(async () => values);
    const result = await resolveEmbeddingVector('тест', embed);
    expect(result.source).toBe('provider');
    expect(result.values).toBe(values);
    expect(embed).toHaveBeenCalledOnce();
  });

  it('falls back to local on wrong dimension', async () => {
    const embed = vi.fn(async () => [0.1, 0.2, 0.3]);
    const result = await resolveEmbeddingVector('тест', embed);
    expect(result.source).toBe('local');
    expect(result.values).toHaveLength(RAG_EMBEDDING_DIM);
  });

  it('falls back to local when provider throws', async () => {
    const embed = vi.fn(async () => {
      throw new Error('offline');
    });
    const result = await resolveEmbeddingVector('тест', embed);
    expect(result.source).toBe('local');
    expect(result.values).toHaveLength(RAG_EMBEDDING_DIM);
  });
});
