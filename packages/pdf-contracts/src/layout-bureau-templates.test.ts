import { describe, expect, it } from 'vitest';
import {
  applyLayoutTemplateObjects,
  BUILTIN_LAYOUT_TEMPLATES,
  serializePageToTemplate,
} from './layout-bureau-templates.js';
import type { LayoutPageObject } from './layout-editor.js';

describe('layout-bureau-templates', () => {
  it('includes builtin cover, spread, three-renders', () => {
    const ids = BUILTIN_LAYOUT_TEMPLATES.map((t) => t.id);
    expect(ids).toContain('builtin-cover');
    expect(ids).toContain('builtin-spread');
    expect(ids).toContain('builtin-three-renders');
  });

  it('applyLayoutTemplateObjects maps template page 1 to target page', () => {
    const spread = BUILTIN_LAYOUT_TEMPLATES.find((t) => t.id === 'builtin-spread')!;
    const objects = applyLayoutTemplateObjects(spread.objects, 3, 10);
    expect(objects.length).toBe(2);
    expect(objects.every((o) => o.page === 3)).toBe(true);
    expect(objects.every((o) => o.kind === 'shape')).toBe(true);
  });

  it('serializePageToTemplate strips image src to slots', () => {
    const pageObjects: LayoutPageObject[] = [
      {
        kind: 'image',
        id: 'img-1',
        page: 2,
        imageSrc: 'data:image/png;base64,abc',
        rotation: 0,
        rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
      },
      {
        kind: 'shape',
        id: 'shape-1',
        page: 2,
        fill: { type: 'solid', color: '#000' },
        rect: { x: 0, y: 0, width: 1, height: 0.1 },
      },
    ];
    const stored = serializePageToTemplate(pageObjects, 2);
    expect(stored).toHaveLength(2);
    expect(stored[0]?.kind).toBe('image-slot');
    expect(stored[1]?.kind).toBe('shape');
    expect(stored.every((o) => o.page === 1)).toBe(true);
  });
});
