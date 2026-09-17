import { describe, expect, it } from 'vitest';
import { collectAcceptedEditsForPdf } from './collect-accepted-edits.js';

type AnnotationInput = {
  page: number;
  content: string;
  quote: string | null;
  meta: unknown;
};

function annotation(page: number, quote: string, content: string, meta: unknown = null): AnnotationInput {
  return { page, quote, content, meta };
}

describe('collectAcceptedEditsForPdf', () => {
  it('оставляет разные правки на одной странице', () => {
    const edits = collectAcceptedEditsForPdf(
      [],
      [annotation(1, 'первый', 'один'), annotation(1, 'второй', 'два')],
    );
    expect(edits).toHaveLength(2);
  });

  it('дедуплицирует конфликтующие правки на одном месте, оставляя последнюю', () => {
    const edits = collectAcceptedEditsForPdf(
      [],
      [
        annotation(2, 'Оплата в течение 5 дней', 'старое'),
        annotation(2, 'оплата в течение 5 дней', 'новое'),
      ],
    );
    expect(edits).toHaveLength(1);
    expect(edits[0].suggestion).toBe('новое');
  });

  it('не дедуплицирует одинаковый текст на разных страницах', () => {
    const edits = collectAcceptedEditsForPdf(
      [],
      [annotation(1, 'текст', 'а'), annotation(2, 'текст', 'б')],
    );
    expect(edits).toHaveLength(2);
  });

  it('пропускает ручную правку, связанную с уже принятым ИИ-предложением', () => {
    const edits = collectAcceptedEditsForPdf(
      [{ id: 's1', page: 1, originalText: 'цитата', suggestion: 'замена' }],
      [annotation(1, 'цитата', 'замена', { suggestionId: 's1' })],
    );
    expect(edits).toHaveLength(1);
    expect(edits[0].suggestion).toBe('замена');
  });
});
