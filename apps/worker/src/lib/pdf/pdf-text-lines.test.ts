import { describe, expect, it } from 'vitest';
import { paragraphDrawMode } from './pdf-text-lines.js';

describe('paragraphDrawMode', () => {
  it('uses per-line draw for single layout line', () => {
    expect(paragraphDrawMode(1, 'один абзац')).toBe('per-line');
  });

  it('uses unified draw for wrapped paragraph in PDF', () => {
    expect(paragraphDrawMode(3, 'Новый текст абзаца целиком без переносов')).toBe('unified');
  });

  it('uses expanded draw when suggestion has more lines than layout', () => {
    expect(paragraphDrawMode(2, '• a\n• b\n• c')).toBe('expanded');
  });

  it('uses per-line draw when suggestion lines match layout lines', () => {
    expect(paragraphDrawMode(3, 'line one\nline two\nline three')).toBe('per-line');
  });
});
