import { describe, expect, it } from 'vitest';
import { parseAiSuggestionsFromLlm, toUserFacingAiSuggestionsError } from './suggestions.js';
describe('parseAiSuggestionsFromLlm', () => {
  it('parses fenced JSON', () => {
    const items = parseAiSuggestionsFromLlm(
      '```json\n{"suggestions":[{"fragmentId":"f1","originalText":"a","suggestion":"b","reason":"c"}]}\n```',
    );
    expect(items).toHaveLength(1);
    expect(items[0]?.fragmentId).toBe('f1');
  });
  it('parses raw array', () => {
    const items = parseAiSuggestionsFromLlm(
      '[{"fragmentId":"f2","originalText":"x","suggestion":"y","reason":"z","page":3}]',
    );
    expect(items[0]?.page).toBe(3);
  });
  it('repairs trailing commas in object', () => {
    const items = parseAiSuggestionsFromLlm(
      '{"suggestions":[{"fragmentId":"f3","originalText":"а","suggestion":"б","reason":"в",},],}',
    );
    expect(items).toHaveLength(1);
  });
  it('repairs truncated json with jsonrepair fallback', () => {
    const items = parseAiSuggestionsFromLlm(
      'Анализ:\n{"suggestions":[{"fragmentId":"f5","originalText":"текст","suggestion":"правка","reason":"риск","page":2}',
    );
    expect(items).toHaveLength(1);
    expect(items[0]?.page).toBe(2);
  });
});

describe('toUserFacingAiSuggestionsError', () => {
  it('hides JSON technical detail from legacy messages', () => {
    expect(
      toUserFacingAiSuggestionsError(
        new Error('ИИ вернул ответ в неверном формате. (JSON not found in model response)'),
      ),
    ).toBe(
      'ИИ не смог оформить ответ как список правок. Попробуйте ещё раз или выберите анализ одной страницы.',
    );
  });
});
