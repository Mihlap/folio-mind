const INVALID_FORMAT_MESSAGE =
  'ИИ не смог оформить ответ как список правок. Попробуйте ещё раз или выберите анализ одной страницы.';

const NO_SUGGESTIONS_MESSAGE =
  'ИИ не смог сформировать предложения по документу. Попробуйте снова или укажите одну страницу.';

/** Убирает технические подробности из текста ошибки ИИ-правок для показа в UI. */
export function formatAiSuggestionsError(message: string | null | undefined): string {
  const trimmed = message?.trim() ?? '';
  if (!trimmed) return NO_SUGGESTIONS_MESSAGE;
  if (
    trimmed.includes('JSON') ||
    trimmed.includes('неверном формате') ||
    trimmed.includes('структур') ||
    trimmed.includes('валидным JSON')
  ) {
    return INVALID_FORMAT_MESSAGE;
  }
  if (trimmed.includes('неполный список')) {
    return 'ИИ вернул неполный список правок. Попробуйте запрос ещё раз.';
  }
  const withoutTechnicalSuffix = trimmed.replace(/\s*\([^)]*\)\s*$/, '').trim();
  if (
    withoutTechnicalSuffix.includes('JSON') ||
    withoutTechnicalSuffix.includes('неверном формате')
  ) {
    return INVALID_FORMAT_MESSAGE;
  }
  return withoutTechnicalSuffix || NO_SUGGESTIONS_MESSAGE;
}
