import { jsonrepair } from 'jsonrepair';
import { z } from 'zod';

export const aiSuggestionItemSchema = z.object({
  fragmentId: z.string().min(1),
  originalText: z.string().min(1),
  suggestion: z.string().min(1),
  reason: z.string().min(1),
  page: z.number().int().min(1).optional(),
});

export const aiSuggestionsResponseSchema = z.object({
  suggestions: z.array(aiSuggestionItemSchema).max(30),
});

export type AiSuggestionItem = z.infer<typeof aiSuggestionItemSchema>;

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

/** Извлекает первый сбалансированный JSON-объект или массив из текста. */
export function extractBalancedJsonSubstring(text: string): string | null {
  const objectStart = text.indexOf('{');
  const arrayStart = text.indexOf('[');
  let start = -1;
  if (objectStart >= 0 && arrayStart >= 0) {
    start = Math.min(objectStart, arrayStart);
  } else {
    start = Math.max(objectStart, arrayStart);
  }
  if (start < 0) return null;

  const open = text[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
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
      if (depth === 0) return text.slice(start, i + 1);
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

  const balanced = extractBalancedJsonSubstring(trimmed);
  if (balanced) {
    return parseJsonLenient(balanced);
  }

  throw new Error('JSON not found in model response');
}

export function parseAiSuggestionsFromLlm(text: string): AiSuggestionItem[] {
  let raw: unknown;
  try {
    raw = extractJsonFromLlm(text);
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'неизвестная ошибка';
    throw new Error(
      `ИИ вернул ответ в неверном формате. Попробуйте ещё раз. (${detail})`,
    );
  }

  const asObject =
    typeof raw === 'object' && raw !== null && 'suggestions' in raw
      ? raw
      : { suggestions: raw };

  try {
    const parsed = aiSuggestionsResponseSchema.parse(asObject);
    return parsed.suggestions;
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'неизвестная ошибка';
    throw new Error(`Ответ ИИ не прошёл проверку структуры. (${detail})`);
  }
}
