export type ExtractionFieldType = 'string' | 'number' | 'boolean' | 'array' | 'object';

export type ExtractionFieldSchema = {
  name: string;
  type: ExtractionFieldType;
  label: string;
  description: string;
  children?: ExtractionFieldSchema[];
};

export type ExtractionTemplateId = 'contract' | 'contract_sections' | 'act' | 'tz';

export type ExtractionTemplate = {
  id: ExtractionTemplateId;
  title: string;
  description: string;
  schema: ExtractionFieldSchema[];
};

export const EXTRACTION_TEMPLATE_IDS = ['contract', 'contract_sections', 'act', 'tz'] as const;

export const EXTRACTION_FIELD_TYPES = ['string', 'number', 'boolean', 'array', 'object'] as const;

export function isExtractionTemplateId(value: unknown): value is ExtractionTemplateId {
  return value === 'contract' || value === 'contract_sections' || value === 'act' || value === 'tz';
}

export function isExtractionFieldType(value: unknown): value is ExtractionFieldType {
  return (
    value === 'string' ||
    value === 'number' ||
    value === 'boolean' ||
    value === 'array' ||
    value === 'object'
  );
}

export function validateExtractionSchema(schema: unknown): ExtractionFieldSchema[] {
  if (!Array.isArray(schema) || schema.length === 0) {
    throw new Error('Схема извлечения должна быть непустым массивом полей');
  }
  if (schema.length > 40) {
    throw new Error('Слишком много полей в схеме (макс. 40)');
  }
  return schema.map((item, index) => validateField(item, `schema[${index}]`));
}

function validateField(item: unknown, path: string): ExtractionFieldSchema {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw new Error(`${path}: ожидался объект поля`);
  }
  const row = item as Record<string, unknown>;
  if (typeof row.name !== 'string' || !row.name.trim()) {
    throw new Error(`${path}.name: обязательная непустая строка`);
  }
  if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/.test(row.name)) {
    throw new Error(`${path}.name: допустимы латиница, цифры и _`);
  }
  if (!isExtractionFieldType(row.type)) {
    throw new Error(`${path}.type: string|number|boolean|array|object`);
  }
  if (typeof row.description !== 'string' || !row.description.trim()) {
    throw new Error(`${path}.description: обязательная строка`);
  }
  const label =
    typeof row.label === 'string' && row.label.trim()
      ? row.label.trim().slice(0, 120)
      : row.name.trim();
  const field: ExtractionFieldSchema = {
    name: row.name.trim(),
    type: row.type,
    label,
    description: row.description.trim().slice(0, 500),
  };
  if (row.children !== undefined) {
    if (!Array.isArray(row.children)) {
      throw new Error(`${path}.children: ожидался массив`);
    }
    if (row.children.length > 20) {
      throw new Error(`${path}.children: слишком много вложенных полей`);
    }
    field.children = row.children.map((child, i) => validateField(child, `${path}.children[${i}]`));
  }
  return field;
}

export function schemaToPromptLines(schema: ExtractionFieldSchema[], indent = 0): string {
  const pad = '  '.repeat(indent);
  const lines: string[] = [];
  for (const field of schema) {
    lines.push(`${pad}- ${field.name} (${field.type}): ${field.description}`);
    if (field.children?.length) {
      lines.push(schemaToPromptLines(field.children, indent + 1));
    }
  }
  return lines.join('\n');
}
