import { describe, expect, it } from 'vitest';
import type { TextItem, TextMatch } from './find-text-positions.js';
import { eraseBoxesForEdit } from './render-text-replacements.js';
import { clampBoxToNeighborLines, textItemBox, textSubstringBox } from './pdf-text-bounds.js';

function item(partial: Partial<TextItem> & { str: string; x: number; y: number }): TextItem {
  return {
    width: partial.str.length * 6,
    height: 12,
    fontSize: 12,
    fontName: 'f1',
    fontFamily: 'sans-serif',
    hasEOL: false,
    ...partial,
  };
}

function matchFor(items: TextItem[]): TextMatch {
  const box = textItemBox(items[0]!);
  return {
    box,
    style: { fontSize: 12, fontName: 'f1', fontFamily: 'sans-serif', lineHeight: 14 },
    lines: [
      {
        x: box.x,
        y: items[0]!.y,
        width: box.width,
        box,
        style: { fontSize: 12, fontName: 'f1', fontFamily: 'sans-serif', lineHeight: 14 },
        originalText: items.map((entry) => entry.str).join(''),
        items,
      },
    ],
  };
}

describe('pdf-text-bounds', () => {
  it('uses the original transform font size instead of a scaled glyph height', () => {
    const box = textItemBox(item({ str: 'Текст', x: 40, y: 700, fontSize: 18, height: 18, ascent: 0.75, descent: -0.25 }));
    expect(box.height).toBeCloseTo(18, 5);
    expect(box.y).toBeCloseTo(695.5, 5);
    expect(box.y + box.height).toBeCloseTo(713.5, 5);
  });

  it('computes a substring box inside a single PDF item', () => {
    const source = item({ str: 'abcdef', x: 10, y: 100, width: 60, fontSize: 12 });
    const box = textSubstringBox(source, 2, 3, source.str.length);
    expect(box.x).toBeCloseTo(30, 5);
    expect(box.width).toBeCloseTo(30, 5);
    expect(box.height).toBeCloseTo(12, 5);
  });

  it('clamps the erase box to the middle between neighboring baselines', () => {
    const box = { x: 10, y: 692, width: 100, height: 16 };
    const clamped = clampBoxToNeighborLines(box, 700, [716, 700, 684], 8);
    expect(clamped.y + clamped.height).toBeLessThanOrEqual(708);
    expect(clamped.y).toBeGreaterThanOrEqual(692);
  });

  it('does not merge erase boxes of two separate matched lines', () => {
    const top = item({ str: 'Первая строка', x: 40, y: 700, fontSize: 12 });
    const bottom = item({ str: 'Вторая строка', x: 40, y: 684, fontSize: 12 });
    const match: TextMatch = {
      box: textItemBox(top),
      style: { fontSize: 12, fontName: 'f1', fontFamily: 'sans-serif', lineHeight: 14 },
      lines: [
        {
          x: 40,
          y: 700,
          width: textItemBox(top).width,
          box: textItemBox(top),
          style: { fontSize: 12, fontName: 'f1', fontFamily: 'sans-serif', lineHeight: 14 },
          originalText: top.str,
          items: [top],
        },
        {
          x: 40,
          y: 684,
          width: textItemBox(bottom).width,
          box: textItemBox(bottom),
          style: { fontSize: 12, fontName: 'f1', fontFamily: 'sans-serif', lineHeight: 14 },
          originalText: bottom.str,
          items: [bottom],
        },
      ],
    };
    const boxes = eraseBoxesForEdit(match, [top, bottom]);
    expect(boxes).toHaveLength(2);
    expect(boxes[0]!.y).toBeGreaterThan(boxes[1]!.y);
    expect(boxes[0]!.y).toBeGreaterThanOrEqual(692);
    expect(boxes[0]!.y).toBeGreaterThan(textItemBox(bottom).y + textItemBox(bottom).height);
  });

  it('keeps replacement masks from extending into the previous line', () => {
    const previous = item({ str: 'Строка выше', x: 40, y: 716, fontSize: 12 });
    const current = item({ str: 'Строка правки', x: 40, y: 700, fontSize: 12 });
    const boxes = eraseBoxesForEdit(matchFor([current]), [previous, current]);
    const previousBox = textItemBox(previous);
    expect(boxes).toHaveLength(1);
    expect(boxes[0]!.y + boxes[0]!.height).toBeLessThanOrEqual(previousBox.y);
  });
});
