import { describe, expect, it } from 'vitest';
import { searchTextInItems, type TextItem } from './find-text-positions.js';

function item(str: string, x: number, y: number): TextItem {
  return {
    str,
    x,
    y,
    width: str.length * 6,
    height: 12,
    fontSize: 12,
    fontName: 'f1',
    fontFamily: 'sans-serif',
    hasEOL: false,
  };
}

describe('searchTextInItems list quotes', () => {
  it('highlights each list line separately without text before the list', () => {
    const items = [
      item('Вводный абзац без правки', 40, 720),
      item('•', 40, 700),
      item(' Slovníku jazyka', 52, 700),
      item('•', 40, 680),
      item(' kaˆ tîn qerapÒntwn', 52, 680),
    ];
    const quote = 'Slovníku jazyka\nkaˆ tîn qerapÒntwn';
    const boxes = searchTextInItems(items, quote, { xNorm: 0.1, yNorm: 0.2 }, { width: 600, height: 800 });
    expect(boxes).toHaveLength(2);
    expect(boxes.every((box) => box.height < 20)).toBe(true);
    expect(boxes[0]!.y).toBeGreaterThan(boxes[1]!.y);
    expect(boxes[0]!.x).toBeGreaterThan(50);
  });
});
