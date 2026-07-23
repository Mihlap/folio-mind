import type { ExtractionTemplate } from '../extraction-schema.js';

export const contractTemplate: ExtractionTemplate = {
  id: 'contract',
  title: 'Ключевые данные договора',
  description: 'Стороны, предмет, цена, сроки, оплата, гарантия, расторжение, подсудность',
  schema: [
    {
      name: 'documentType',
      type: 'string',
      label: 'Тип документа',
      description: 'Тип документа (договор подряда, оказания услуг и т.п.)',
    },
    {
      name: 'contractNumber',
      type: 'string',
      label: 'Номер договора',
      description: 'Номер договора, если указан',
    },
    {
      name: 'contractDate',
      type: 'string',
      label: 'Дата договора',
      description: 'Дата заключения договора',
    },
    {
      name: 'place',
      type: 'string',
      label: 'Место заключения',
      description: 'Город или место заключения',
    },
    {
      name: 'customer',
      type: 'object',
      label: 'Заказчик',
      description: 'Заказчик (первая сторона)',
      children: [
        { name: 'name', type: 'string', label: 'Наименование', description: 'Наименование или ФИО' },
        { name: 'inn', type: 'string', label: 'ИНН', description: 'ИНН, если есть' },
        {
          name: 'representative',
          type: 'string',
          label: 'Представитель',
          description: 'Представитель / должность',
        },
      ],
    },
    {
      name: 'contractor',
      type: 'object',
      label: 'Исполнитель',
      description: 'Исполнитель / подрядчик',
      children: [
        { name: 'name', type: 'string', label: 'Наименование', description: 'Наименование или ФИО' },
        { name: 'inn', type: 'string', label: 'ИНН', description: 'ИНН, если есть' },
        {
          name: 'representative',
          type: 'string',
          label: 'Представитель',
          description: 'Представитель / должность',
        },
      ],
    },
    {
      name: 'subject',
      type: 'string',
      label: 'Предмет',
      description: 'Предмет договора кратко (что делают / поставляют)',
    },
    {
      name: 'price',
      type: 'object',
      label: 'Цена',
      description: 'Цена и валюта',
      children: [
        { name: 'amount', type: 'number', label: 'Сумма', description: 'Сумма числом' },
        { name: 'currency', type: 'string', label: 'Валюта', description: 'Валюта (RUB и т.п.)' },
        {
          name: 'vatIncluded',
          type: 'boolean',
          label: 'НДС включён',
          description: 'Включает ли НДС',
        },
      ],
    },
    {
      name: 'payment',
      type: 'string',
      label: 'Оплата',
      description:
        'Порядок и сроки оплаты, аванс, рассрочка — кратко, только если явно указано в тексте',
    },
    {
      name: 'term',
      type: 'object',
      label: 'Сроки',
      description: 'Сроки выполнения работ / оказания услуг',
      children: [
        { name: 'start', type: 'string', label: 'Начало', description: 'Начало работ / действия' },
        { name: 'end', type: 'string', label: 'Окончание', description: 'Окончание / срок' },
      ],
    },
    {
      name: 'warranty',
      type: 'string',
      label: 'Гарантия',
      description: 'Гарантийные обязательства и срок гарантии, если есть',
    },
    {
      name: 'penalties',
      type: 'string',
      label: 'Штрафы / неустойка',
      description: 'Кратко о штрафах / неустойке, если есть',
    },
    {
      name: 'termination',
      type: 'string',
      label: 'Расторжение',
      description: 'Условия расторжения / одностороннего отказа, если есть',
    },
    {
      name: 'jurisdiction',
      type: 'string',
      label: 'Подсудность',
      description: 'Суд / арбитраж / применимое право, если указано',
    },
  ],
};
