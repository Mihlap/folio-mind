import {
  PRINT_MIN_DPI,
  type PrintReadinessLevel,
  type PrintReadinessReport,
} from '@folio-mind/pdf-contracts';
import { countPdfPages } from './pdf-previews.js';

type RawImage = { widthPx: number; heightPx: number };

function levelFromDpi(dpi: number | null): PrintReadinessLevel {
  if (dpi == null) return 'warning';
  if (dpi >= PRINT_MIN_DPI) return 'ok';
  if (dpi >= PRINT_MIN_DPI * 0.75) return 'warning';
  return 'issue';
}

function maxLevel(a: PrintReadinessLevel, b: PrintReadinessLevel): PrintReadinessLevel {
  const order = { ok: 0, warning: 1, issue: 2 } as const;
  return order[a] >= order[b] ? a : b;
}

function extractEmbeddedImages(pdfBuffer: Buffer): RawImage[] {
  const latin = pdfBuffer.toString('latin1');
  const images: RawImage[] = [];
  const pattern = /\/Subtype\s*\/Image[\s\S]{0,400}?\/Width\s+(\d+)[\s\S]{0,120}?\/Height\s+(\d+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(latin)) !== null) {
    const widthPx = Number(match[1]);
    const heightPx = Number(match[2]);
    if (widthPx > 0 && heightPx > 0) {
      images.push({ widthPx, heightPx });
    }
  }
  return images;
}

function countEmbeddedFontObjects(pdfBuffer: Buffer): number {
  const latin = pdfBuffer.toString('latin1');
  const fontFile = (latin.match(/\/FontFile2?\b/g) ?? []).length;
  const fontFile3 = (latin.match(/\/FontFile3\b/g) ?? []).length;
  return fontFile + fontFile3;
}

function estimateFullBleedDpi(image: RawImage, pageWidthPt = 595): number {
  const pageWidthIn = pageWidthPt / 72;
  return Math.round(image.widthPx / pageWidthIn);
}

export async function analyzePrintReadiness(pdfBuffer: Buffer): Promise<PrintReadinessReport> {
  const pageCount = await countPdfPages(pdfBuffer);
  const rawImages = extractEmbeddedImages(pdfBuffer);
  const embeddedFonts = countEmbeddedFontObjects(pdfBuffer);

  const fontLevel: PrintReadinessLevel =
    embeddedFonts > 0 ? 'ok' : pageCount > 0 ? 'warning' : 'ok';
  const fontNote =
    embeddedFonts > 0
      ? `Найдено ${embeddedFonts} встроенных объектов шрифта.`
      : 'Явно встроенных шрифтов не найдено — для печати может потребоваться подстановка.';

  const warnings: string[] = [];
  if (embeddedFonts === 0) {
    warnings.push('Шрифты: не обнаружены встроенные FontFile — проверьте PDF в Acrobat перед тиражом.');
  }

  const imagesPerPage = Math.max(1, Math.ceil(rawImages.length / Math.max(pageCount, 1)));
  const pages = Array.from({ length: pageCount }, (_, index) => {
    const page = index + 1;
    const sliceStart = index * imagesPerPage;
    const slice = rawImages.slice(sliceStart, sliceStart + imagesPerPage);
    const imageFindings = slice.map((img, imgIndex) => {
      const estimatedDpi = estimateFullBleedDpi(img);
      const level = levelFromDpi(estimatedDpi);
      return {
        index: imgIndex + 1,
        widthPx: img.widthPx,
        heightPx: img.heightPx,
        estimatedDpi,
        level,
        note:
          estimatedDpi >= PRINT_MIN_DPI
            ? 'Достаточно для печати (оценка при полной ширине листа).'
            : `Ниже ${PRINT_MIN_DPI} dpi — возможна пикселизация.`,
      };
    });
    const minEstimatedDpi =
      imageFindings.length > 0
        ? Math.min(...imageFindings.map((item) => item.estimatedDpi ?? Number.MAX_SAFE_INTEGER))
        : null;
    let pageLevel: PrintReadinessLevel = imageFindings.length > 0 ? 'ok' : 'warning';
    for (const finding of imageFindings) {
      pageLevel = maxLevel(pageLevel, finding.level);
    }
    if (imageFindings.length === 0) {
      warnings.push(`Стр. ${page}: растровые изображения не найдены в слое PDF (вектор/текст или flatten).`);
    }
    return {
      page,
      imageCount: imageFindings.length,
      minEstimatedDpi: minEstimatedDpi === Number.MAX_SAFE_INTEGER ? null : minEstimatedDpi,
      level: pageLevel,
      images: imageFindings,
    };
  });

  let overallLevel: PrintReadinessLevel = fontLevel;
  for (const page of pages) {
    overallLevel = maxLevel(overallLevel, page.level);
  }

  const lowDpiPages = pages.filter((p) => p.level === 'issue').length;
  if (lowDpiPages > 0) {
    warnings.push(`${lowDpiPages} стр. с оценкой DPI ниже ${PRINT_MIN_DPI} — проверьте исходники в медиатеке.`);
  }

  return {
    pageCount,
    overallLevel,
    fonts: {
      embeddedFontObjects: embeddedFonts,
      level: fontLevel,
      note: fontNote,
    },
    pages,
    warnings,
    checkedAt: new Date().toISOString(),
  };
}
