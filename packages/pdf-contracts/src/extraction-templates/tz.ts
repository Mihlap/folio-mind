import type { ExtractionTemplate } from '../extraction-schema.js';

export const tzTemplate: ExtractionTemplate = {
  id: 'tz',
  title: 'Техническое задание',
  description: 'Объект, требования, сроки, результаты',
  schema: [
    {
      name: 'title',
      type: 'string',
      label: 'Название',
      description: 'Название ТЗ / проекта',
    },
    {
      name: 'object',
      type: 'string',
      label: 'Объект',
      description: 'Объект / адрес / описание объекта',
    },
    {
      name: 'goals',
      type: 'string',
      label: 'Цели',
      description: 'Цели работ',
    },
    {
      name: 'scope',
      type: 'array',
      label: 'Состав работ',
      description: 'Состав работ / разделы',
      children: [
        { name: 'item', type: 'string', label: 'Пункт', description: 'Пункт состава работ' },
      ],
    },
    {
      name: 'requirements',
      type: 'array',
      label: 'Требования',
      description: 'Ключевые требования',
      children: [
        { name: 'item', type: 'string', label: 'Требование', description: 'Требование' },
      ],
    },
    {
      name: 'deliverables',
      type: 'array',
      label: 'Результаты',
      description: 'Результаты / комплект документации',
      children: [
        { name: 'item', type: 'string', label: 'Результат', description: 'Результат' },
      ],
    },
    {
      name: 'deadline',
      type: 'string',
      label: 'Срок',
      description: 'Срок выполнения',
    },
  ],
};
