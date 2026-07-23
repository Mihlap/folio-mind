import { describe, expect, it } from 'vitest';
import {
  buildExtractionDisplayRows,
  formatExtractionPlainText,
  isBlankExtractedValue,
  sanitizeExtractedValue,
} from './extraction-display.js';
import { getExtractionTemplate } from './extraction-templates/index.js';

describe('isBlankExtractedValue', () => {
  it('treats form blanks as empty', () => {
    expect(isBlankExtractedValue('_________________')).toBe(true);
    expect(isBlankExtractedValue('№_______')).toBe(true);
    expect(isBlankExtractedValue('« » 20 13 г.')).toBe(true);
    expect(isBlankExtractedValue('г. Мурманск « » 20 13 г.')).toBe(true);
    expect(isBlankExtractedValue('Исполнитель -1, Исполнитель -2')).toBe(true);
    expect(isBlankExtractedValue('')).toBe(true);
    expect(isBlankExtractedValue(null)).toBe(true);
  });

  it('keeps real values', () => {
    expect(isBlankExtractedValue('г. Мурманск')).toBe(false);
    expect(isBlankExtractedValue({ name: 'ООО Ромашка', representative: '___' })).toBe(false);
  });
});

describe('buildExtractionDisplayRows', () => {
  it('uses Russian labels and hides blanks', () => {
    const schema = getExtractionTemplate('contract').schema;
    const rows = buildExtractionDisplayRows(
      {
        documentType: 'Договор оказания услуг',
        contractNumber: '№_______',
        contractDate: 'г. Мурманск « » 20 13 г.',
        place: 'г. Мурманск',
        customer: { name: '_________________', representative: '' },
        contractor: {
          name: 'Исполнитель -1, Исполнитель -2',
          representative: '______________________________',
        },
        subject: 'Услуги',
        price: null,
        term: { start: '', end: null },
        penalties: null,
      },
      schema,
    );

    const labels = rows.map((r) => r.label);
    expect(labels).toContain('Тип документа');
    expect(labels).toContain('Место заключения');
    expect(labels).not.toContain('Дата договора');
    expect(labels).not.toContain('Исполнитель');
    expect(labels).not.toContain('contractNumber');
    expect(rows.find((r) => r.label === 'Заказчик')).toBeUndefined();

    const text = formatExtractionPlainText(rows, 'Договор');
    expect(text).toContain('Тип документа: Договор оказания услуг');
    expect(text).toContain('Место заключения: г. Мурманск');
    expect(text).not.toContain('_______');
  });

  it('renders important terms as topic/detail rows', () => {
    const schema = getExtractionTemplate('contract_sections').schema;
    const rows = buildExtractionDisplayRows(
      {
        terms: [
          {
            topic: 'Оплата',
            detail: 'Оплата в течение 10 банковских дней после подписания акта',
          },
          {
            topic: 'Права',
            detail: 'Описывает права сторон по договору',
          },
        ],
      },
      schema,
    );
    expect(rows.some((r) => r.label === 'Оплата')).toBe(true);
    expect(rows.find((r) => r.label === 'Оплата')?.value).toMatch(/10 банковских/);
    // short TOC fluff without facts is hidden
    expect(rows.find((r) => r.label === 'Права')).toBeUndefined();
  });
});

describe('sanitizeExtractedValue', () => {
  it('nulls blank nested fields', () => {
    expect(
      sanitizeExtractedValue({
        name: 'ООО Тест',
        representative: '_____',
      }),
    ).toEqual({ name: 'ООО Тест' });
  });
});
