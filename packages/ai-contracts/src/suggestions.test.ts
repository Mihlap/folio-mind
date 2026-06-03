import { describe, expect, it } from 'vitest';
import { parseAiSuggestionsFromLlm } from './suggestions.js';

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

  it('extracts object when model adds text after json', () => {
    const items = parseAiSuggestionsFromLlm(
      'Вот результат:\n{"suggestions":[{"fragmentId":"f4","originalText":"текст","suggestion":"правка","reason":"риск"}]}\nГотово.',
    );
    expect(items[0]?.fragmentId).toBe('f4');
  });
});
