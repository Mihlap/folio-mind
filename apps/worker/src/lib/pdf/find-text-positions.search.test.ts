import { describe, expect, it } from 'vitest';
import { pickBestTextBoxNearAnchor, searchTextInItems, type TextItem } from './find-text-positions.js';

function item(str: string, x: number, y: number, width: number): TextItem {
  return {
    str,
    x,
    y,
    width,
    height: 12,
    fontSize: 12,
    fontName: 'f1',
    fontFamily: 'sans-serif',
    hasEOL: false,
  };
}

describe('searchTextInItems', () => {
  const paragraph =
    'При подготовке текста статьи в статье не должно быть заголовка статьи, аннотации, ключевых слов на русском и английском языке.';

  it('находит весь абзац, а не фрагмент «Пр», если PDF разбил «При» на части', () => {
    const items: TextItem[] = [
      item('Пр', 50, 700, 14),
      item('и подготовке текста статьи в статье не должно быть заголовка статьи, аннотации, ключевых', 64, 700, 420),
      item('слов на русском и английском языке.', 50, 684, 180),
    ];

    const boxes = searchTextInItems(items, paragraph);
    expect(boxes).toHaveLength(1);
    expect(boxes[0]!.width).toBeGreaterThan(400);
    expect(boxes[0]!.x).toBeLessThanOrEqual(50);
  });

  it('находит абзац при произвольном порядке items в PDF-потоке', () => {
    const items: TextItem[] = [
      item('слов на русском и английском языке.', 50, 684, 180),
      item('Пр', 50, 700, 14),
      item('и подготовке текста статьи в статье не должно быть заголовка статьи, аннотации, ключевых', 64, 700, 420),
    ];

    const boxes = searchTextInItems(items, paragraph);
    expect(boxes).toHaveLength(1);
    expect(boxes[0]!.width).toBeGreaterThan(400);
    expect(boxes[0]!.x).toBeLessThanOrEqual(50);
  });

  it('находит абзац с переносами строк в quote', () => {
    const multiLine =
      'При подготовке текста статьи в статье не должно быть заголовка статьи,\nаннотации, ключевых слов на русском и английском языке.';
    const items: TextItem[] = [
      item('При подготовке текста статьи в статье не должно быть заголовка статьи,', 50, 700, 420),
      item('аннотации, ключевых слов на русском и английском языке.', 50, 684, 360),
    ];
    const boxes = searchTextInItems(items, multiLine);
    expect(boxes).toHaveLength(1);
    expect(boxes[0]!.width).toBeGreaterThan(350);
  });

  it('для короткой фразы в одном item ищет точное вхождение', () => {
    const items: TextItem[] = [item('Короткая фраза в тексте.', 10, 100, 120)];
    const boxes = searchTextInItems(items, 'Короткая фраза');
    expect(boxes).toHaveLength(1);
    expect(boxes[0]!.x).toBe(10);
  });

  it('при дубликате текста выбирает bbox ближе к якорю (этап E)', () => {
    const boxes = [
      { x: 50, y: 680, width: 40, height: 16 },
      { x: 50, y: 100, width: 40, height: 16 },
    ];
    const pageSize = { width: 595, height: 842 };
    const nearTop = pickBestTextBoxNearAnchor(boxes, { xNorm: 0.15, yNorm: 0.12 }, pageSize);
    const nearBottom = pickBestTextBoxNearAnchor(boxes, { xNorm: 0.15, yNorm: 0.88 }, pageSize);
    expect(nearTop.y).toBeGreaterThan(nearBottom.y);
  });
});
