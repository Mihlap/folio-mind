/** Размерность локальных эмбеддингов (совпадает с vector(384) в Postgres). */
export const RAG_EMBEDDING_DIM = 384;

function fnv1a(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []).slice(0, 512);
}

function l2Normalize(vec: number[]): number[] {
  let sum = 0;
  for (const v of vec) sum += v * v;
  const norm = Math.sqrt(sum);
  if (norm <= 0) return vec;
  return vec.map((v) => v / norm);
}

/** Локальный эмбеддинг без внешнего API (feature hashing + bigrams). */
export function embedTextLocal(text: string): number[] {
  const vec = new Array<number>(RAG_EMBEDDING_DIM).fill(0);
  const tokens = tokenize(text);

  for (const token of tokens) {
    vec[fnv1a(token) % RAG_EMBEDDING_DIM] += 1;
  }
  for (let i = 0; i < tokens.length - 1; i++) {
    vec[fnv1a(`${tokens[i]}_${tokens[i + 1]}`) % RAG_EMBEDDING_DIM] += 0.5;
  }

  return l2Normalize(vec);
}

/** Литерал для pgvector: `[0.1,0.2,...]`. */
export function embeddingToPgVector(values: number[]): string {
  return `[${values.map((v) => (Number.isFinite(v) ? v.toFixed(8) : '0')).join(',')}]`;
}
