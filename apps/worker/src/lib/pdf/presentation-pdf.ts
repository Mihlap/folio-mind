import { PDFDocument, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import {
  PRESENTATION_SLIDE_HEIGHT_PT as SLIDE_H,
  PRESENTATION_SLIDE_WIDTH_PT as SLIDE_W,
  fitImageContain,
  isPresentationSlideLayout,
  resolveSlideGeometry,
  splitSlideBullets,
  wrapSlideText,
  type PresentationSlideLayout,
} from '@folio-mind/pdf-contracts';
import { embedCyrillicFont, registerPdfFontkit } from './pdf-cyrillic-font.js';

export type PresentationPdfSlide = {
  title: string | null;
  subtitle: string | null;
  body: string | null;
  layoutVariant: string;
  background: string | null;
  imageBytes?: Buffer | null;
  imageMime?: string | null;
};

const DEFAULT_BACKGROUND = rgb(0.973, 0.98, 0.988);
const TITLE_COLOR = rgb(0.118, 0.161, 0.231);
const SUBTITLE_COLOR = rgb(0.392, 0.455, 0.545);
const BODY_COLOR = rgb(0.278, 0.333, 0.412);
const OVERLAY_COLOR = rgb(0, 0, 0);
const OVERLAY_TEXT = rgb(1, 1, 1);
const OVERLAY_SUBTITLE = rgb(0.878, 0.906, 0.941);

type TextStyle = { size: number; lineHeight: number; color: RGB };

const LAYOUT_TEXT_STYLES: Record<
  PresentationSlideLayout,
  { title: TextStyle; subtitle: TextStyle; bullet: TextStyle; bullets: boolean }
> = {
  section: {
    title: { size: 48, lineHeight: 58, color: TITLE_COLOR },
    subtitle: { size: 20, lineHeight: 28, color: SUBTITLE_COLOR },
    bullet: { size: 18, lineHeight: 26, color: BODY_COLOR },
    bullets: false,
  },
  title_only: {
    title: { size: 40, lineHeight: 50, color: TITLE_COLOR },
    subtitle: { size: 22, lineHeight: 30, color: SUBTITLE_COLOR },
    bullet: { size: 18, lineHeight: 26, color: BODY_COLOR },
    bullets: true,
  },
  image_right: {
    title: { size: 32, lineHeight: 40, color: TITLE_COLOR },
    subtitle: { size: 18, lineHeight: 26, color: SUBTITLE_COLOR },
    bullet: { size: 16, lineHeight: 24, color: BODY_COLOR },
    bullets: true,
  },
  image_top: {
    title: { size: 32, lineHeight: 40, color: TITLE_COLOR },
    subtitle: { size: 18, lineHeight: 26, color: SUBTITLE_COLOR },
    bullet: { size: 16, lineHeight: 24, color: BODY_COLOR },
    bullets: true,
  },
  image_full: {
    title: { size: 30, lineHeight: 36, color: OVERLAY_TEXT },
    subtitle: { size: 18, lineHeight: 24, color: OVERLAY_SUBTITLE },
    bullet: { size: 16, lineHeight: 24, color: OVERLAY_SUBTITLE },
    bullets: true,
  },
};

function parseColor(value: string | null | undefined): RGB {
  if (!value) return DEFAULT_BACKGROUND;
  const hex = value.trim().replace(/^#/, '');
  const full = hex.length === 3 ? hex.replace(/./g, (c) => c + c) : hex;
  if (full.length !== 6) return DEFAULT_BACKGROUND;
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some((n) => !Number.isFinite(n))) return DEFAULT_BACKGROUND;
  return rgb(r / 255, g / 255, b / 255);
}

function drawTextLine(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  topCss: number,
  style: TextStyle,
): number {
  page.drawText(text, {
    x,
    y: SLIDE_H - (topCss + style.size),
    size: style.size,
    font,
    color: style.color,
  });
  return topCss + style.lineHeight;
}

function wrapToLines(
  font: PDFFont,
  text: string,
  style: TextStyle,
  maxWidth: number,
): string[] {
  return wrapSlideText(text, maxWidth, (line) => font.widthOfTextAtSize(line, style.size));
}

function drawTextBlock(params: {
  page: PDFPage;
  font: PDFFont;
  rect: { x: number; y: number; width: number; height: number };
  title: string | null;
  subtitle: string | null;
  body: string | null;
  styles: (typeof LAYOUT_TEXT_STYLES)[PresentationSlideLayout];
}): number {
  const { page, font, rect, title, subtitle, body, styles } = params;
  const bottom = rect.y + rect.height;
  let cursor = rect.y;

  if (title) {
    const lines = wrapToLines(font, title, styles.title, rect.width);
    for (const line of lines) {
      if (cursor + styles.title.lineHeight > bottom) return bottom - rect.y;
      cursor = drawTextLine(page, font, line, rect.x, cursor, styles.title);
    }
  }

  if (subtitle) {
    cursor += 4;
    const lines = wrapToLines(font, subtitle, styles.subtitle, rect.width);
    for (const line of lines) {
      if (cursor + styles.subtitle.lineHeight > bottom) return bottom - rect.y;
      cursor = drawTextLine(page, font, line, rect.x, cursor, styles.subtitle);
    }
  }

  if (styles.bullets && body) {
    const bullets = splitSlideBullets(body);
    if (bullets.length > 0) {
      cursor += 8;
      for (const bullet of bullets) {
        const lines = wrapToLines(font, bullet, styles.bullet, rect.width - 16);
        for (const [index, line] of lines.entries()) {
          if (cursor + styles.bullet.lineHeight > bottom) return bottom - rect.y;
          const text = index === 0 ? `• ${line}` : `  ${line}`;
          cursor = drawTextLine(page, font, text, rect.x + (index === 0 ? 0 : 12), cursor, styles.bullet);
        }
      }
    }
  }

  return cursor - rect.y;
}

async function embedSlideImage(pdfDoc: PDFDocument, slide: PresentationPdfSlide) {
  if (!slide.imageBytes || slide.imageBytes.length === 0) return null;
  const mime = (slide.imageMime ?? '').toLowerCase();
  try {
    if (mime.includes('jpg') || mime.includes('jpeg')) {
      return await pdfDoc.embedJpg(new Uint8Array(slide.imageBytes));
    }
    if (mime.includes('png')) {
      return await pdfDoc.embedPng(new Uint8Array(slide.imageBytes));
    }
  } catch {
    return null;
  }
  return null;
}

export async function buildPresentationPdf(slides: PresentationPdfSlide[]): Promise<{
  buffer: Buffer;
  pageCount: number;
}> {
  const pdfDoc = await PDFDocument.create();
  registerPdfFontkit(pdfDoc);
  const font = await embedCyrillicFont(pdfDoc);
  const safeSlides = slides.length > 0 ? slides : [{ title: null, subtitle: null, body: null, layoutVariant: 'section', background: null }];

  for (const slide of safeSlides) {
    const layout = isPresentationSlideLayout(slide.layoutVariant) ? slide.layoutVariant : 'image_top';
    const geometry = resolveSlideGeometry(layout);
    const styles = LAYOUT_TEXT_STYLES[layout];
    const page = pdfDoc.addPage([SLIDE_W, SLIDE_H]);
    page.drawRectangle({
      x: 0,
      y: 0,
      width: SLIDE_W,
      height: SLIDE_H,
      color: parseColor(slide.background),
    });

    const image = await embedSlideImage(pdfDoc, slide);
    if (image && geometry.imageRect) {
      const box = fitImageContain(geometry.imageRect, image.width, image.height);
      page.drawImage(image, {
        x: box.x,
        y: SLIDE_H - (box.y + box.height),
        width: box.width,
        height: box.height,
      });
      if (layout === 'image_full') {
        page.drawRectangle({
          x: geometry.textRect.x,
          y: SLIDE_H - (geometry.textRect.y + geometry.textRect.height),
          width: geometry.textRect.width,
          height: geometry.textRect.height,
          color: OVERLAY_COLOR,
          opacity: 0.45,
        });
      }
    }

    drawTextBlock({
      page,
      font,
      rect: geometry.textRect,
      title: slide.title,
      subtitle: slide.subtitle,
      body: slide.body,
      styles,
    });
  }

  const bytes = await pdfDoc.save();
  return { buffer: Buffer.from(bytes), pageCount: safeSlides.length };
}
