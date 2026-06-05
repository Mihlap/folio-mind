import type { PDFDocument, PDFFont } from 'pdf-lib';
import { rgb } from 'pdf-lib';
import {
  drawLabelAndExcerpt,
  drawTextLine,
  drawWrappedParagraph,
  type PdfTextLayout,
} from './pdf-text-layout.js';

export type AppendixEdit = {
  page: number;
  originalText: string;
  suggestion: string;
};

const BODY_SIZE = 8;
const TITLE_SIZE = 11;
const LINE_HEIGHT = 11;
const EXCERPT_MAX = 110;

function compactExcerpt(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= EXCERPT_MAX) return oneLine;
  return `${oneLine.slice(0, EXCERPT_MAX - 1)}…`;
}

function startLayout(pdfDoc: PDFDocument, font: PDFFont): PdfTextLayout {
  const page = pdfDoc.addPage();
  const { width, height } = page.getSize();
  return {
    pdfDoc,
    page,
    font,
    y: height - 40,
    pageWidth: width,
    pageHeight: height,
    marginX: 40,
    marginBottom: 48,
    lineHeight: LINE_HEIGHT,
  };
}

/** Компактное приложение: реестр правок с переносами и постраничной разбивкой */
export function renderAcceptedEditsAppendix(
  pdfDoc: PDFDocument,
  font: PDFFont,
  edits: AppendixEdit[],
): void {
  const layout = startLayout(pdfDoc, font);

  drawTextLine(layout, 'Приложение: реестр согласованных правок', {
    fontSize: TITLE_SIZE,
    color: rgb(0.1, 0.1, 0.1),
  });
  layout.y -= 4;

  drawWrappedParagraph(
    layout,
    'Текст страниц договора не изменён. Ниже — компактный реестр: страница и краткие фрагменты «было / стало». Полные формулировки — в интерфейсе Folio Mind.',
    {
      fontSize: BODY_SIZE,
      color: rgb(0.35, 0.35, 0.35),
      gapAfter: 8,
    },
  );

  for (const [index, edit] of edits.entries()) {
    layout.y -= 4;
    drawTextLine(layout, `${index + 1}. Стр. ${edit.page}`, {
      fontSize: BODY_SIZE,
      color: rgb(0.2, 0.2, 0.2),
    });

    drawLabelAndExcerpt(layout, 'Было:', compactExcerpt(edit.originalText), {
      fontSize: BODY_SIZE,
      labelColor: rgb(0.55, 0.2, 0.2),
      textColor: rgb(0.35, 0.15, 0.15),
    });

    drawLabelAndExcerpt(layout, 'Стало:', compactExcerpt(edit.suggestion), {
      fontSize: BODY_SIZE,
      labelColor: rgb(0.15, 0.45, 0.3),
      textColor: rgb(0.15, 0.3, 0.22),
      indent: 8,
    });

    layout.y -= 2;
  }
}
