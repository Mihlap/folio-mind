import type { ExtractionTemplate } from '../extraction-schema.js';

export const actTemplate: ExtractionTemplate = {
  id: 'act',
  title: 'Акт выполненных работ',
  description: 'Стороны, период, объём, сумма',
  schema: [
    {
      name: 'actNumber',
      type: 'string',
      label: 'Номер акта',
      description: 'Номер акта',
    },
    {
      name: 'actDate',
      type: 'string',
      label: 'Дата акта',
      description: 'Дата акта',
    },
    {
      name: 'contractReference',
      type: 'string',
      label: 'Договор',
      description: 'Ссылка на договор (номер/дата)',
    },
    {
      name: 'customer',
      type: 'string',
      label: 'Заказчик',
      description: 'Заказчик',
    },
    {
      name: 'contractor',
      type: 'string',
      label: 'Исполнитель',
      description: 'Исполнитель',
    },
    {
      name: 'period',
      type: 'string',
      label: 'Период',
      description: 'Период выполнения работ',
    },
    {
      name: 'works',
      type: 'array',
      label: 'Работы / услуги',
      description: 'Перечень работ / услуг',
      children: [
        {
          name: 'name',
          type: 'string',
          label: 'Наименование',
          description: 'Наименование позиции',
        },
        {
          name: 'quantity',
          type: 'string',
          label: 'Количество',
          description: 'Количество / объём',
        },
        { name: 'amount', type: 'number', label: 'Сумма', description: 'Сумма по позиции' },
      ],
    },
    {
      name: 'totalAmount',
      type: 'number',
      label: 'Итого',
      description: 'Итоговая сумма',
    },
    {
      name: 'currency',
      type: 'string',
      label: 'Валюта',
      description: 'Валюта',
    },
  ],
};
