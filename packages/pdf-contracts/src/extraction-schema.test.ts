import { describe, expect, it } from 'vitest';
import {
  schemaToPromptLines,
  validateExtractionSchema,
} from './extraction-schema.js';
import { getExtractionTemplate, listExtractionTemplates } from './extraction-templates/index.js';

describe('validateExtractionSchema', () => {
  it('accepts nested template-like schema', () => {
    const schema = validateExtractionSchema([
      {
        name: 'party',
        type: 'object',
        label: 'Сторона',
        description: 'Сторона',
        children: [{ name: 'inn', type: 'string', label: 'ИНН', description: 'ИНН' }],
      },
    ]);
    expect(schema[0]?.name).toBe('party');
    expect(schema[0]?.label).toBe('Сторона');
    expect(schema[0]?.children?.[0]?.name).toBe('inn');
  });

  it('rejects empty schema', () => {
    expect(() => validateExtractionSchema([])).toThrow(/непустым/);
  });

  it('rejects bad field names', () => {
    expect(() =>
      validateExtractionSchema([{ name: '1bad', type: 'string', description: 'x' }]),
    ).toThrow(/name/);
  });
});

describe('extraction templates', () => {
  it('lists four built-in templates in stable order', () => {
    const list = listExtractionTemplates();
    expect(list).toHaveLength(4);
    expect(list.map((t) => t.id)).toEqual([
      'contract',
      'contract_sections',
      'act',
      'tz',
    ]);
  });

  it('contract template has unique top-level names and key risk fields', () => {
    const names = getExtractionTemplate('contract').schema.map((f) => f.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(
      expect.arrayContaining(['payment', 'warranty', 'termination', 'jurisdiction']),
    );
  });

  it('contract_sections template is factual terms, not TOC', () => {
    const schema = getExtractionTemplate('contract_sections').schema;
    expect(getExtractionTemplate('contract_sections').title).toBe('Важные условия');
    expect(schema[0]?.name).toBe('terms');
    expect(schema[0]?.children?.map((c) => c.name)).toEqual(['topic', 'detail']);
  });

  it('schemaToPromptLines includes nested fields', () => {
    const lines = schemaToPromptLines(getExtractionTemplate('contract').schema);
    expect(lines).toContain('customer');
    expect(lines).toMatch(/inn/);
    expect(lines).toContain('payment');
  });
});
