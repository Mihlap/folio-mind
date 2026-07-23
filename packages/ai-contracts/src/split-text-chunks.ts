export type SplitTextChunksOptions = {
  maxChunkSize?: number;  
  overlap?: number;
};

function clampOverlap(maxChunkSize: number, overlap: number): number {
  if (overlap <= 0) return 0;
  if (overlap >= maxChunkSize) return Math.max(0, Math.floor(maxChunkSize / 4));
  return overlap;
}

function hardSplit(text: string, maxChunkSize: number, overlap: number): string[] {
  if (text.length <= maxChunkSize) return [text];
  const step = Math.max(1, maxChunkSize - overlap);
  const parts: string[] = [];
  for (let i = 0; i < text.length; i += step) {
    const slice = text.slice(i, i + maxChunkSize).trim();
    if (slice) parts.push(slice);
    if (i + maxChunkSize >= text.length) break;
  }
  return parts;
}

export function splitTextIntoChunks(
  text: string,
  maxChunkSizeOrOptions: number | SplitTextChunksOptions = 1000,
): string[] {
  const options: SplitTextChunksOptions =
    typeof maxChunkSizeOrOptions === 'number'
      ? { maxChunkSize: maxChunkSizeOrOptions, overlap: 100 }
      : maxChunkSizeOrOptions;
  const maxChunkSize = Math.max(200, options.maxChunkSize ?? 1000);
  const overlap = clampOverlap(maxChunkSize, options.overlap ?? 100);

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
      chunks.push(...hardSplit(paragraph, maxChunkSize, overlap));
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
