import {
  DEFAULT_LAYOUT_GRADIENT_FILL,
  DEFAULT_LAYOUT_SOLID_FILL,
  type LayoutPageObject,
  type LayoutRect,
  type LayoutShapeObject,
} from './layout-editor.js';

/** Объект шаблона без imageSrc — слот под фото или фигура. */
export type LayoutTemplateStoredObject =
  | {
      kind: 'image-slot';
      page: number;
      rect: LayoutRect;
      rotation?: number;
      label?: string;
    }
  | LayoutShapeObject;

export type LayoutTemplateCategory = 'cover' | 'spread' | 'three-renders' | 'custom';

export type LayoutTemplateDefinition = {
  id: string;
  name: string;
  description: string;
  category: LayoutTemplateCategory;
  objects: LayoutTemplateStoredObject[];
  builtin?: boolean;
};

const COVER: LayoutTemplateDefinition = {
  id: 'builtin-cover',
  name: 'Обложка',
  description: 'Верхняя полоса, крупное фото по центру, нижний блок под подпись',
  category: 'cover',
  builtin: true,
  objects: [
    {
      kind: 'shape',
      id: 'cover-band',
      page: 1,
      fill: DEFAULT_LAYOUT_GRADIENT_FILL,
      rect: { x: 0, y: 0, width: 1, height: 0.14 },
    },
    {
      kind: 'image-slot',
      page: 1,
      label: 'Главное фото',
      rect: { x: 0.08, y: 0.18, width: 0.84, height: 0.58 },
    },
    {
      kind: 'shape',
      id: 'cover-footer',
      page: 1,
      fill: DEFAULT_LAYOUT_SOLID_FILL,
      rect: { x: 0.08, y: 0.82, width: 0.84, height: 0.1 },
    },
  ],
};

const SPREAD: LayoutTemplateDefinition = {
  id: 'builtin-spread',
  name: 'Разворот',
  description: 'Два кадра рядом на одной странице',
  category: 'spread',
  builtin: true,
  objects: [
    {
      kind: 'image-slot',
      page: 1,
      label: 'Слева',
      rect: { x: 0.05, y: 0.12, width: 0.44, height: 0.76 },
    },
    {
      kind: 'image-slot',
      page: 1,
      label: 'Справа',
      rect: { x: 0.51, y: 0.12, width: 0.44, height: 0.76 },
    },
  ],
};

const THREE_RENDERS: LayoutTemplateDefinition = {
  id: 'builtin-three-renders',
  name: 'Три рендера',
  description: 'Три равных кадра в ряд',
  category: 'three-renders',
  builtin: true,
  objects: [
    {
      kind: 'image-slot',
      page: 1,
      label: 'Рендер 1',
      rect: { x: 0.04, y: 0.15, width: 0.29, height: 0.7 },
    },
    {
      kind: 'image-slot',
      page: 1,
      label: 'Рендер 2',
      rect: { x: 0.355, y: 0.15, width: 0.29, height: 0.7 },
    },
    {
      kind: 'image-slot',
      page: 1,
      label: 'Рендер 3',
      rect: { x: 0.67, y: 0.15, width: 0.29, height: 0.7 },
    },
  ],
};

export const BUILTIN_LAYOUT_TEMPLATES: LayoutTemplateDefinition[] = [COVER, SPREAD, THREE_RENDERS];

function clampPage(page: number, maxPage: number): number {
  const normalized = Math.max(1, Math.floor(page));
  if (maxPage > 0) return Math.min(normalized, maxPage);
  return normalized;
}

/** Разворачивает шаблон на целевую страницу (page 1 шаблона → targetPage). */
export function applyLayoutTemplateObjects(
  templateObjects: LayoutTemplateStoredObject[],
  targetPage: number,
  pageCount = 0,
): LayoutPageObject[] {
  const result: LayoutPageObject[] = [];
  for (const obj of templateObjects) {
    const relPage = Number(obj.page ?? 1);
    const page = clampPage(targetPage + relPage - 1, pageCount);
    if (obj.kind === 'image-slot') {
      const placeholder: LayoutShapeObject = {
        kind: 'shape',
        id: crypto.randomUUID(),
        page,
        fill: { type: 'solid', color: '#cbd5e1' },
        rect: { ...obj.rect },
        rotation: obj.rotation,
      };
      result.push(placeholder);
      continue;
    }
    if (obj.kind === 'shape') {
      result.push({
        ...obj,
        id: crypto.randomUUID(),
        page,
        rect: { ...obj.rect },
      });
      continue;
    }
  }
  return result;
}

export function serializePageToTemplate(
  objects: LayoutPageObject[],
  page: number,
): LayoutTemplateStoredObject[] {
  return objects
    .filter((item) => Number(item.page) === page)
    .map((item) => {
      if (item.kind === 'shape') {
        return {
          kind: 'shape' as const,
          id: item.id,
          page: 1,
          rect: { ...item.rect },
          fill: item.fill,
          rotation: item.rotation,
        };
      }
      return {
        kind: 'image-slot' as const,
        page: 1,
        rect: { ...item.rect },
        rotation: item.rotation,
        label: 'Фото',
      };
    });
}
