import { describe, expect, it } from 'vitest';
import { RAG_EMBEDDING_DIM, embedTextLocal, embeddingToPgVector } from './rag-embeddings.js';
describe('embedTextLocal', () => {
  it('returns normalized vector of fixed size', () => {
    const v = embedTextLocal('договор аренды помещения');
    expect(v).toHaveLength(RAG_EMBEDDING_DIM);
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 5);
  });
  it('similar texts have higher cosine similarity than unrelated', () => {
    const a = embedTextLocal('срок действия договора и расторжение');
    const b = embedTextLocal('расторжение договора по сроку');
    const c = embedTextLocal('рецепт борща с картофелем');
    const dot = (x: number[], y: number[]) => x.reduce((s, v, i) => s + v * y[i], 0);
    expect(dot(a, b)).toBeGreaterThan(dot(a, c));
  });
  it('formats pgvector literal', () => {
    expect(embeddingToPgVector([0.1, 0.2])).toBe('[0.10000000,0.20000000]');
  });
});
