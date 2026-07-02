import { clampLayoutRect, type LayoutRect } from './layout-editor.js';

export type LayoutMarginPresetId = 'none' | 'a4-safe' | 'a3-safe' | 'a4-bleed' | 'a3-bleed';

export type LayoutMarginsMm = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type LayoutMarginPreset = {
  id: LayoutMarginPresetId;
  label: string;
  marginMm: LayoutMarginsMm;
  bleedMm: number;
};

export const LAYOUT_MARGIN_PRESETS: LayoutMarginPreset[] = [
  {
    id: 'none',
    label: 'Без полей',
    marginMm: { top: 0, right: 0, bottom: 0, left: 0 },
    bleedMm: 0,
  },
  {
    id: 'a4-safe',
    label: 'A4 — безопасное поле 15 мм',
    marginMm: { top: 15, right: 15, bottom: 15, left: 15 },
    bleedMm: 3,
  },
  {
    id: 'a3-safe',
    label: 'A3 — безопасное поле 15 мм',
    marginMm: { top: 15, right: 15, bottom: 15, left: 15 },
    bleedMm: 3,
  },
  {
    id: 'a4-bleed',
    label: 'A4 — поля 10 мм + вылет 3 мм',
    marginMm: { top: 10, right: 10, bottom: 10, left: 10 },
    bleedMm: 3,
  },
  {
    id: 'a3-bleed',
    label: 'A3 — поля 10 мм + вылет 3 мм',
    marginMm: { top: 10, right: 10, bottom: 10, left: 10 },
    bleedMm: 3,
  },
];

export type LayoutPageGuides = {
  safe: LayoutRect;
  bleed: LayoutRect;
};

export function getLayoutMarginPreset(id: LayoutMarginPresetId): LayoutMarginPreset {
  return LAYOUT_MARGIN_PRESETS.find((item) => item.id === id) ?? LAYOUT_MARGIN_PRESETS[0]!;
}

export function layoutGuidesFromMargins(
  pageWidthMm: number,
  pageHeightMm: number,
  marginMm: LayoutMarginsMm,
  bleedMm: number,
): LayoutPageGuides {
  if (pageWidthMm <= 0 || pageHeightMm <= 0) {
    const full = { x: 0, y: 0, width: 1, height: 1 };
    return { safe: full, bleed: full };
  }

  const safe = clampLayoutRect({
    x: marginMm.left / pageWidthMm,
    y: marginMm.top / pageHeightMm,
    width: (pageWidthMm - marginMm.left - marginMm.right) / pageWidthMm,
    height: (pageHeightMm - marginMm.top - marginMm.bottom) / pageHeightMm,
  });

  const bleed = clampLayoutRect({
    x: bleedMm / pageWidthMm,
    y: bleedMm / pageHeightMm,
    width: (pageWidthMm - bleedMm * 2) / pageWidthMm,
    height: (pageHeightMm - bleedMm * 2) / pageHeightMm,
  });

  return { safe, bleed };
}

export function layoutGuidesForPreset(
  pageWidthMm: number,
  pageHeightMm: number,
  presetId: LayoutMarginPresetId,
): LayoutPageGuides | null {
  const preset = getLayoutMarginPreset(presetId);
  if (preset.id === 'none') return null;
  return layoutGuidesFromMargins(pageWidthMm, pageHeightMm, preset.marginMm, preset.bleedMm);
}

export const FULL_LAYOUT_CROP: LayoutRect = { x: 0, y: 0, width: 1, height: 1 };

export function normalizeLayoutCrop(crop?: LayoutRect): LayoutRect {
  if (!crop) return FULL_LAYOUT_CROP;
  return clampLayoutRect(crop, 0.02);
}

export function isFullLayoutCrop(crop?: LayoutRect): boolean {
  const normalized = normalizeLayoutCrop(crop);
  return (
    normalized.x <= 0.001 &&
    normalized.y <= 0.001 &&
    normalized.width >= 0.999 &&
    normalized.height >= 0.999
  );
}
