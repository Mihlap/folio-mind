const STOP_WORDS = new Set([
  'это',
  'как',
  'для',
  'при',
  'или',
  'так',
  'все',
  'его',
  'она',
  'они',
  'том',
  'что',
  'чем',
  'где',
  'когда',
  'если',
  'без',
  'под',
  'над',
  'между',
  'после',
  'перед',
  'того',
  'также',
  'либо',
  'иной',
  'иные',
  'договор',
  'сторона',
  'стороны',
  'сторон',
  'настоящий',
  'настоящего',
  'настоящему',
  'регламент',
  'сверка',
]);
export function extractRagSearchTerms(text: string, max = 8): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 4 && !STOP_WORDS.has(w));
  const seen = new Set<string>();
  const result: string[] = [];
  for (const word of words) {
    if (seen.has(word)) continue;
    seen.add(word);
    result.push(word);
    if (result.length >= max) break;
  }
  return result;
}
