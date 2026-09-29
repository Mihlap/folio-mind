export const PRESENTATION_SLIDE_WIDTH_PT = 960;
export const PRESENTATION_SLIDE_HEIGHT_PT = 540;
export const PRESENTATION_SLIDE_ASPECT =
  PRESENTATION_SLIDE_WIDTH_PT / PRESENTATION_SLIDE_HEIGHT_PT;

export type PresentationAiMode = 'none' | 'advise' | 'assemble' | 'author';

export const PRESENTATION_AI_MODES: PresentationAiMode[] = ['none', 'advise', 'assemble', 'author'];

export type PresentationSlideLayout =
  | 'title_only'
  | 'image_right'
  | 'image_top'
  | 'image_full'
  | 'section';

export const PRESENTATION_SLIDE_LAYOUTS: PresentationSlideLayout[] = [
  'title_only',
  'image_right',
  'image_top',
  'image_full',
  'section',
];

export const PRESENTATION_SLIDE_DEFAULT_LAYOUT: PresentationSlideLayout = 'image_top';

export function isPresentationSlideLayout(value: string): value is PresentationSlideLayout {
  return (PRESENTATION_SLIDE_LAYOUTS as string[]).includes(value);
}

export function isPresentationAiMode(value: string): value is PresentationAiMode {
  return (PRESENTATION_AI_MODES as string[]).includes(value);
}

export type SlideRectPt = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SlideGeometry = {
  layout: PresentationSlideLayout;
  textRect: SlideRectPt;
  imageRect: SlideRectPt | null;
};

const SLIDE_MARGIN = 48;

const SLIDE_GEOMETRY: Record<PresentationSlideLayout, SlideGeometry> = {
  title_only: {
    layout: 'title_only',
    textRect: { x: 80, y: 180, width: 800, height: 180 },
    imageRect: null,
  },
  image_right: {
    layout: 'image_right',
    textRect: { x: SLIDE_MARGIN, y: SLIDE_MARGIN, width: 430, height: 444 },
    imageRect: { x: 506, y: SLIDE_MARGIN, width: 406, height: 444 },
  },
  image_top: {
    layout: 'image_top',
    textRect: { x: SLIDE_MARGIN, y: 372, width: 864, height: 120 },
    imageRect: { x: SLIDE_MARGIN, y: SLIDE_MARGIN, width: 864, height: 300 },
  },
  image_full: {
    layout: 'image_full',
    textRect: { x: SLIDE_MARGIN, y: 430, width: 864, height: 62 },
    imageRect: { x: 0, y: 0, width: PRESENTATION_SLIDE_WIDTH_PT, height: PRESENTATION_SLIDE_HEIGHT_PT },
  },
  section: {
    layout: 'section',
    textRect: { x: 80, y: 230, width: 800, height: 80 },
    imageRect: null,
  },
};

export function resolveSlideGeometry(
  layout: PresentationSlideLayout,
): SlideGeometry {
  return SLIDE_GEOMETRY[layout] ?? SLIDE_GEOMETRY[PRESENTATION_SLIDE_DEFAULT_LAYOUT];
}

export type SlideImageBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function fitImageContain(
  box: SlideRectPt,
  imageWidth: number,
  imageHeight: number,
): SlideImageBox {
  if (imageWidth <= 0 || imageHeight <= 0) {
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  }
  const scale = Math.min(box.width / imageWidth, box.height / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return {
    x: box.x + (box.width - width) / 2,
    y: box.y + (box.height - height) / 2,
    width,
    height,
  };
}

export type PresentationSlideInput = {
  id?: string;
  position: number;
  title?: string | null;
  subtitle?: string | null;
  body?: string | null;
  notes?: string | null;
  layoutVariant: PresentationSlideLayout;
  background?: string | null;
  sourcePage?: number | null;
  mediaAssetId?: string | null;
};

export function renumberSlidePositions<T extends PresentationSlideInput>(slides: T[]): T[] {
  return slides.map((slide, index) => ({ ...slide, position: index }));
}

export function normalizeSlidePositions<T extends PresentationSlideInput>(slides: T[]): T[] {
  return renumberSlidePositions([...slides].sort((a, b) => a.position - b.position));
}

export function moveSlide<T extends PresentationSlideInput>(slides: T[], from: number, to: number): T[] {
  if (from < 0 || from >= slides.length) return slides;
  const target = Math.max(0, Math.min(slides.length - 1, to));
  if (from === target) return slides;
  const next = [...slides];
  const [moved] = next.splice(from, 1);
  next.splice(target, 0, moved);
  return renumberSlidePositions(next);
}

export function splitSlideBullets(body: string | null | undefined): string[] {
  if (!body) return [];
  return body
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-–—•]\s*/, '').trim())
    .filter((line) => line.length > 0);
}

export function wrapSlideText(
  text: string,
  maxWidth: number,
  measure: (line: string) => number,
  maxLines = Number.POSITIVE_INFINITY,
): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && measure(candidate) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current) lines.push(current);
  if (lines.length <= maxLines) return lines;
  return applyEllipsis(lines, maxLines, measure, maxWidth);
}

function applyEllipsis(
  lines: string[],
  maxLines: number,
  measure: (line: string) => number,
  maxWidth: number,
): string[] {
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last.length > 1 && measure(`${last}…`) > maxWidth) {
    last = last.slice(0, -1);
  }
  kept[maxLines - 1] = `${last}…`;
  return kept;
}

export type PresentationAiSlideDraft = {
  sourcePage: number | null;
  mediaAssetId: string | null;
  layoutVariant: PresentationSlideLayout;
  title: string | null;
  subtitle: string | null;
  body: string | null;
};

export type PresentationAiDraft = {
  title: string | null;
  subtitle: string | null;
  slides: PresentationAiSlideDraft[];
};

export function parsePresentationAiDraft(raw: string): PresentationAiDraft | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') return null;
  const candidate = parsed as {
    title?: unknown;
    subtitle?: unknown;
    slides?: unknown;
  };
  if (!Array.isArray(candidate.slides)) return null;

  const slides: PresentationAiSlideDraft[] = [];
  for (const entry of candidate.slides) {
    if (!entry || typeof entry !== 'object') continue;
    const slide = entry as Record<string, unknown>;
    const layoutRaw = typeof slide.layoutVariant === 'string' ? slide.layoutVariant : '';
    slides.push({
      sourcePage: typeof slide.sourcePage === 'number' ? slide.sourcePage : null,
      mediaAssetId: typeof slide.mediaAssetId === 'string' ? slide.mediaAssetId : null,
      layoutVariant: isPresentationSlideLayout(layoutRaw)
        ? layoutRaw
        : PRESENTATION_SLIDE_DEFAULT_LAYOUT,
      title: typeof slide.title === 'string' ? slide.title : null,
      subtitle: typeof slide.subtitle === 'string' ? slide.subtitle : null,
      body: typeof slide.body === 'string' ? slide.body : null,
    });
  }

  return {
    title: typeof candidate.title === 'string' ? candidate.title : null,
    subtitle: typeof candidate.subtitle === 'string' ? candidate.subtitle : null,
    slides,
  };
}
