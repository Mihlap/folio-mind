import { describe, expect, it } from 'vitest';
import { findBestVerbatimQuote, findVerbatimQuote } from './quote-verify.js';
import type { PageText } from '@folio-mind/pdf-contracts';

function page(text: string, pageNum = 1): PageText {
  return { page: pageNum, text };
}

describe('findVerbatimQuote', () => {
  it('находит точную цитату с переносами строк и возвращает текст документа с одним пробелом', () => {
    const text = 'Покупатель\nобязуется\nоплатить товар в течение 5\n рабочих дней.';
    const res = findVerbatimQuote(text, 'обязуется оплатить товар в течение 5 рабочих дней');
    expect(res.matched).toBe(true);
    expect(res.confidence).toBe(1);
    expect(res.verbatim).toBe('обязуется оплатить товар в течение 5 рабочих дней');
  });

  it('возвращает исходную пунктуацию документа, а не цитаты', () => {
    const text = 'Сторона «Исполнитель» вправе досрочно расторгнуть договор.';
    const res = findVerbatimQuote(text, 'Сторона "Исполнитель" вправе');
    expect(res.matched).toBe(true);
    expect(res.verbatim).toBe('Сторона «Исполнитель» вправе');
  });

  it('находит цитату при лишней пунктуации в цитате LLM', () => {
    const text = 'Цена услуг составляет 100 000 рублей, включая НДС.';
    const res = findVerbatimQuote(text, 'Цена услуг, составляет 100,000 рублей');
    expect(res.matched).toBe(true);
    expect(res.verbatim).toBe('Цена услуг составляет 100 000 рублей');
    expect(res.confidence).toBeGreaterThanOrEqual(0.82);
  });

  it('не считает совпадение при смысловом расхождении', () => {
    const text = 'Никаких обязательств по страхованию у сторон не возникает.';
    const res = findVerbatimQuote(text, 'Страхование груза возлагается на покупателя');
    expect(res.matched).toBe(false);
  });

  it('не находит пустую или слишком длинную фразу', () => {
    expect(findVerbatimQuote('', 'что-то').matched).toBe(false);
    expect(findVerbatimQuote('текст'.repeat(80), 'а'.repeat(250)).matched).toBe(false);
  });

  it('похожие по алфавиту, но разные слова не проходят порог', () => {
    const text = 'Аванс выплачивается в течение трёх рабочих дней с момента подписания.';
    const res = findVerbatimQuote(text, 'Аванс выплачивается в течение трёх рабочих лет');
    expect(res.matched).toBe(false);
  });
});

describe('findBestVerbatimQuote', () => {
  it('ищет цитату по всем страницам, если страница указана неверно', () => {
    const pages = [page('Реквизиты сторон.', 1), page('Исполнитель обязуется сдать работы до 31 декабря.', 2)];
    const res = findBestVerbatimQuote(pages, 'Исполнитель обязуется сдать работы');
    expect(res.matched).toBe(true);
    expect(res.verbatim).toBe('Исполнитель обязуется сдать работы');
  });

  it('возвращает номер страницы документа, на которой найдена цитата', () => {
    const pages = [
      page('Реквизиты сторон.', 1),
      page('Исполнитель обязуется сдать работы до 31 декабря.', 2),
      page('Приложение 1.', 3),
    ];
    const res = findBestVerbatimQuote(pages, 'Исполнитель обязуется сдать работы');
    expect(res.matched).toBe(true);
    expect(res.page).toBe(2);
  });

  it('возвращает исходную цитату, когда совпадения нет ни на одной странице', () => {
    const pages = [page('Только здесь.', 1)];
    const res = findBestVerbatimQuote(pages, 'Такого фрагмента нет');
    expect(res.matched).toBe(false);
    expect(res.verbatim).toBe('Такого фрагмента нет');
    expect(res.page).toBeUndefined();
  });
});