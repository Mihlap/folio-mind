import { jsonrepair } from 'jsonrepair';
import { z } from 'zod';
export const aiSuggestionItemSchema = z.object({
  fragmentId: z.string().min(1),
  originalText: z.string().min(1),
  suggestion: z.string().min(1),
  reason: z.string().min(1),
  page: z.number().int().min(1).optional(),
  /** true = цитата «было» подтверждена дословным совпадением с текстом PDF. */
  quoteMatched: z.boolean().optional(),
});
export const aiSuggestionsResponseSchema = z.object({
  suggestions: z.array(aiSuggestionItemSchema).max(30),
});
export type AiSuggestionItem = z.infer<typeof aiSuggestionItemSchema>;

export const AI_SUGGESTIONS_USER_ERROR = {
  invalidFormat:
    'ИИ не смог оформить ответ как список правок. Попробуйте ещё раз или выберите анализ одной страницы.',
  invalidStructure: 'ИИ вернул неполный список правок. Попробуйте запрос ещё раз.',
  noSuggestions:
    'ИИ не смог сформировать предложения по документу. Попробуйте снова или укажите одну страницу.',
} as const;

/** Сообщение для UI без технических подробностей (JSON, stack, коды API). */
export function toUserFacingAiSuggestionsError(err: unknown): string {
  if (!(err instanceof Error)) return AI_SUGGESTIONS_USER_ERROR.noSuggestions;
  const msg = err.message.trim();
  if (
    msg.includes('JSON') ||
    msg.includes('неверном формате') ||
    msg.includes('структур') ||
    msg.includes('валидным JSON')
  ) {
    return AI_SUGGESTIONS_USER_ERROR.invalidFormat;
  }
  if (msg.includes('неполный список')) {
    return AI_SUGGESTIONS_USER_ERROR.invalidStructure;
  }
  if (msg.includes('нет текста для анализа')) {
    return msg;
  }
  if (msg.includes('не смог сформировать предложения')) {
    return AI_SUGGESTIONS_USER_ERROR.noSuggestions;
  }
  const withoutTechnicalSuffix = msg.replace(/\s*\([^)]*\)\s*$/, '').trim();
  if (
    withoutTechnicalSuffix.includes('JSON') ||
    withoutTechnicalSuffix.includes('неверном формате')
  ) {
    return AI_SUGGESTIONS_USER_ERROR.invalidFormat;
  }
  if (/[а-яА-ЯёЁ]/.test(withoutTechnicalSuffix)) {
    return withoutTechnicalSuffix;
  }
  return AI_SUGGESTIONS_USER_ERROR.noSuggestions;
}

function parseJsonLenient(jsonStr: string): unknown {
  const trimmed = jsonStr.trim();
  try {
    return JSON.parse(trimmed);
  } catch (firstError) {
    try {
      return JSON.parse(jsonrepair(trimmed));
    } catch {
      throw firstError;
    }
  }
}
export function extractBalancedJsonSubstring(text: string): string | null {
  const objectStart = text.indexOf('{');
  const arrayStart = text.indexOf('[');
  const start =
    objectStart >= 0 && arrayStart >= 0
      ? Math.min(objectStart, arrayStart)
      : Math.max(objectStart, arrayStart);
  if (start < 0) return null;
  return extractBalancedJsonSubstringFromIndex(text, start);
}
function extractBalancedJsonSubstringFromIndex(text: string, startIndex: number): string | null {
  const open = text[startIndex];
  if (open !== '{' && open !== '[') return null;
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = startIndex; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === open) depth++;
    if (ch === close) {
      depth--;
      if (depth === 0) return text.slice(startIndex, i + 1);
    }
  }
  return null;
}
export function extractJsonFromLlm(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return parseJsonLenient(fenced[1]);
  }
  const candidates: string[] = [];
  if (trimmed.startsWith('{')) {
    const cand = extractBalancedJsonSubstringFromIndex(trimmed, 0);
    if (cand) candidates.push(cand);
  } else if (trimmed.startsWith('[')) {
    const cand = extractBalancedJsonSubstringFromIndex(trimmed, 0);
    if (cand) candidates.push(cand);
  }
  const suggestionsIdx = trimmed.indexOf('"suggestions"');
  if (suggestionsIdx >= 0) {
    const braceStart = trimmed.lastIndexOf('{', suggestionsIdx);
    if (braceStart >= 0) {
      const cand = extractBalancedJsonSubstringFromIndex(trimmed, braceStart);
      if (cand) candidates.push(cand);
    }
    const arrayStart = trimmed.lastIndexOf('[', suggestionsIdx);
    if (arrayStart >= 0) {
      const cand = extractBalancedJsonSubstringFromIndex(trimmed, arrayStart);
      if (cand) candidates.push(cand);
    }
  }
  const objectStart = trimmed.indexOf('{');
  if (objectStart >= 0) {
    const cand = extractBalancedJsonSubstringFromIndex(trimmed, objectStart);
    if (cand) candidates.push(cand);
  }
  const arrayStart = trimmed.indexOf('[');
  if (arrayStart >= 0) {
    const cand = extractBalancedJsonSubstringFromIndex(trimmed, arrayStart);
    if (cand) candidates.push(cand);
  }
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    try {
      return parseJsonLenient(candidate);
    } catch {
      // Try the next candidate; LLM responses can include prose around malformed JSON.
    }
  }
  const repairStart = trimmed.indexOf('{');
  if (repairStart >= 0) {
    try {
      return parseJsonLenient(jsonrepair(trimmed.slice(repairStart)));
    } catch {
      // Fall through to the explicit "not found" error below.
    }
  }
  throw new Error('JSON not found in model response');
}
export function parseAiSuggestionsFromLlm(text: string): AiSuggestionItem[] {
  let raw: unknown;
  try {
    raw = extractJsonFromLlm(text);
  } catch {
    throw new Error(AI_SUGGESTIONS_USER_ERROR.invalidFormat);
  }
  const asObject =
    typeof raw === 'object' && raw !== null && 'suggestions' in raw ? raw : { suggestions: raw };
  try {
    const parsed = aiSuggestionsResponseSchema.parse(asObject);
    return parsed.suggestions;
  } catch {
    throw new Error(AI_SUGGESTIONS_USER_ERROR.invalidStructure);
  }
}
