import type { ExtractionFieldSchema } from './extraction-schema.js';

export type ExtractionDisplayRow = {
  key: string;
  label: string;
  value: string;
  depth: number;
};

export function isBlankExtractedValue(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === 'boolean') return false;
  if (typeof value === 'number') return Number.isNaN(value);
  if (typeof value === 'string') {
    const t = value.trim();
    if (!t) return true;
    if (/^[_\s.\-–—«»№]+$/u.test(t)) return true;
    // Blank form noise without a real word: « » 20 13 г., №_______, ____
    if ((/[«»_]/.test(t) || /^№\s*_/.test(t)) && !/[а-яёА-ЯЁa-zA-Z]{3,}/u.test(t)) {
      return true;
    }   
    if (/[«»_]/.test(t) && /\d{0,4}\s*г\.?/iu.test(t)) return true;
    if (/«\s*»/.test(t) && /\d{2,4}/.test(t) && /г\.?/iu.test(t)) return true;   
    if (isRolePlaceholderName(t)) return true;
    return false;
  }
  if (Array.isArray(value)) {
    return value.every((item) => isBlankExtractedValue(item));
  }
  if (typeof value === 'object') {
    const entries = Object.values(value as Record<string, unknown>);
    return entries.length === 0 || entries.every((item) => isBlankExtractedValue(item));
  }
  return false;
}

function isRolePlaceholderName(text: string): boolean {
  const parts = text
    .split(/[,;]/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return false;
  const roleOnly =
    /^(заказчик|исполнитель|подрядчик|поставщик|покупатель|продавец)\s*[-–—]?\s*\d*$/iu;
  return parts.every((p) => roleOnly.test(p));
}

export function sanitizeExtractedValue(value: unknown): unknown {
  if (isBlankExtractedValue(value)) return null;
  if (Array.isArray(value)) {
    const items = value
      .map((item) => sanitizeExtractedValue(item))
      .filter((item) => !isBlankExtractedValue(item));
    return items.length > 0 ? items : null;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const cleaned = sanitizeExtractedValue(v);
      if (!isBlankExtractedValue(cleaned)) out[k] = cleaned;
    }
    return Object.keys(out).length > 0 ? out : null;
  }
  if (typeof value === 'string') return value.trim();
  return value;
}

function fieldLabel(field: ExtractionFieldSchema | undefined, key: string): string {
  if (field?.label?.trim()) return field.label.trim();
  if (field?.description?.trim()) {
    // short label: take description before comma/paren
    const d = field.description.trim();
    const cut = d.split(/[,(]/)[0]?.trim();
    if (cut) return cut;
  }
  return FALLBACK_LABELS[key] ?? key;
}

const FALLBACK_LABELS: Record<string, string> = {
  documentType: 'Тип документа',
  contractNumber: 'Номер договора',
  contractDate: 'Дата договора',
  place: 'Место заключения',
  customer: 'Заказчик',
  contractor: 'Исполнитель',
  subject: 'Предмет',
  price: 'Цена',
  term: 'Сроки',
  payment: 'Оплата',
  warranty: 'Гарантия',
  termination: 'Расторжение',
  jurisdiction: 'Подсудность',
  sections: 'Разделы',
  terms: 'Условия',
  topic: 'Тема',
  detail: 'Суть',
  summary: 'Кратко',
  penalties: 'Штрафы / неустойка',
  name: 'Наименование',
  inn: 'ИНН',
  representative: 'Представитель',
  amount: 'Сумма',
  currency: 'Валюта',
  vatIncluded: 'НДС включён',
  start: 'Начало',
  end: 'Окончание',
  actNumber: 'Номер акта',
  actDate: 'Дата акта',
  contractReference: 'Договор',
  period: 'Период',
  works: 'Работы / услуги',
  totalAmount: 'Итого',
  title: 'Название',
  object: 'Объект',
  goals: 'Цели',
  scope: 'Состав работ',
  requirements: 'Требования',
  deliverables: 'Результаты',
  deadline: 'Срок',
  item: 'Пункт',
  quantity: 'Количество',
};

function schemaByName(schema: ExtractionFieldSchema[] | undefined): Map<string, ExtractionFieldSchema> {
  const map = new Map<string, ExtractionFieldSchema>();
  if (!schema) return map;
  for (const field of schema) map.set(field.name, field);
  return map;
}

function formatScalar(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'да' : 'нет';
  return String(value);
}

function expandTermArrayRows(
  key: string,
  value: unknown[],
  field: ExtractionFieldSchema | undefined,
): ExtractionDisplayRow[] {
  const rows: ExtractionDisplayRow[] = [];
  for (let i = 0; i < value.length; i++) {
    const item = value[i];
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const obj = item as Record<string, unknown>;
    const topicRaw = obj.topic ?? obj.title;
    const detailRaw = obj.detail ?? obj.summary;
    if (isBlankExtractedValue(detailRaw) && isBlankExtractedValue(topicRaw)) continue;
    if (isBlankExtractedValue(detailRaw)) continue;   
    if (typeof detailRaw === 'string' && isMetaSectionSummary(detailRaw)) continue;
    const label =
      typeof topicRaw === 'string' && !isBlankExtractedValue(topicRaw)
        ? topicRaw.trim()
        : `${fieldLabel(field, key)} ${i + 1}`;
    rows.push({
      key: `${key}-${i}`,
      label,
      value: formatScalar(detailRaw),
      depth: 0,
    });
  }
  return rows;
}

function isMetaSectionSummary(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (t.length > 120) return false;
  if (/\d/.test(t) || /день|дн\.|срок|оплат|обязан|штраф|возврат|акт/.test(t)) {
    return false;
  }
  return /^(описывает|определяет|перечисляет|устанавливает|содержит|регулирует)\s+(обязанности|права|предмет|порядок|условия)(\s|$)/.test(
    t,
  );
}

function pushObjectRows(
  rows: ExtractionDisplayRow[],
  obj: Record<string, unknown>,
  children: ExtractionFieldSchema[] | undefined,
  depth: number,
): void {
  const childMap = schemaByName(children);
  const keys = [
    ...(children?.map((c) => c.name) ?? []),
    ...Object.keys(obj).filter((k) => !childMap.has(k)),
  ];
  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) continue;
    seen.add(key);
    const value = obj[key];
    if (isBlankExtractedValue(value)) continue;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      rows.push({
        key,
        label: fieldLabel(childMap.get(key), key),
        value: '',
        depth,
      });
      pushObjectRows(
        rows,
        value as Record<string, unknown>,
        childMap.get(key)?.children,
        depth + 1,
      );
      continue;
    }
    if (Array.isArray(value)) {
      rows.push({
        key,
        label: fieldLabel(childMap.get(key), key),
        value: value.map((item) => formatScalar(item)).join('; '),
        depth,
      });
      continue;
    }
    rows.push({
      key,
      label: fieldLabel(childMap.get(key), key),
      value: formatScalar(value),
      depth,
    });
  }
}
export function buildExtractionDisplayRows(
  extracted: Record<string, unknown>,
  schema?: ExtractionFieldSchema[],
): ExtractionDisplayRow[] {
  const rows: ExtractionDisplayRow[] = [];
  const map = schemaByName(schema);
  const keys = [
    ...(schema?.map((f) => f.name) ?? []),
    ...Object.keys(extracted).filter((k) => !map.has(k)),
  ];
  const seen = new Set<string>();

  for (const key of keys) {
    if (seen.has(key)) continue;
    seen.add(key);
    const value = extracted[key];
    if (isBlankExtractedValue(value)) continue;
    const field = map.get(key);

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const nested: ExtractionDisplayRow[] = [];
      pushObjectRows(nested, value as Record<string, unknown>, field?.children, 1);
      if (nested.length === 0) continue;
      rows.push({ key, label: fieldLabel(field, key), value: '', depth: 0 });
      rows.push(...nested);
      continue;
    }

    if (Array.isArray(value)) {
      const termRows = expandTermArrayRows(key, value, field);
      if (termRows.length > 0) {
        rows.push(...termRows);
        continue;
      }
      const parts = value
        .map((item) => {
          if (item && typeof item === 'object' && !Array.isArray(item)) {
            return Object.entries(item as Record<string, unknown>)
              .filter(([, v]) => !isBlankExtractedValue(v))
              .map(([k, v]) => `${fieldLabel(undefined, k)}: ${formatScalar(v)}`)
              .join(', ');
          }
          return formatScalar(item);
        })
        .filter(Boolean);
      if (parts.length === 0) continue;
      rows.push({
        key,
        label: fieldLabel(field, key),
        value: parts.join('\n'),
        depth: 0,
      });
      continue;
    }

    rows.push({
      key,
      label: fieldLabel(field, key),
      value: formatScalar(value),
      depth: 0,
    });
  }

  return rows;
}

export function formatExtractionPlainText(
  rows: ExtractionDisplayRow[],
  templateTitle?: string | null,
): string {
  const lines: string[] = [];
  if (templateTitle) lines.push(templateTitle, '');
  for (const row of rows) {
    const indent = '  '.repeat(row.depth);
    if (row.value) {
      lines.push(`${indent}${row.label}: ${row.value}`);
    } else {
      lines.push(`${indent}${row.label}`);
    }
  }
  return lines.join('\n');
}
