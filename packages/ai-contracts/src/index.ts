export {
  aiSuggestionItemSchema,
  aiSuggestionsResponseSchema,
  extractJsonFromLlm,
  parseAiSuggestionsFromLlm,
  type AiSuggestionItem,
} from './suggestions.js';
export { extractRagSearchTerms } from './rag-search-terms.js';
export { RAG_EMBEDDING_DIM, embedTextLocal, embeddingToPgVector } from './rag-embeddings.js';
export function splitTextIntoChunks(text: string, maxChunkSize = 800): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];
  const paragraphs = normalized
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current = '';
  for (const paragraph of paragraphs) {
    if (paragraph.length > maxChunkSize) {
      if (current) {
        chunks.push(current);
        current = '';
      }
      for (let i = 0; i < paragraph.length; i += maxChunkSize) {
        chunks.push(paragraph.slice(i, i + maxChunkSize));
      }
      continue;
    }
    const next = current ? `${current}\n\n${paragraph}` : paragraph;
    if (next.length > maxChunkSize) {
      if (current) chunks.push(current);
      current = paragraph;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
