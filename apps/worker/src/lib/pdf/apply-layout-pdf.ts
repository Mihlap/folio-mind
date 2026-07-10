import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import { computeLayoutImageDrawParams, formatLayoutPageChromeText, type LayoutImageObject, type LayoutBlankInsertion, type LayoutPageChrome } from '@folio-mind/pdf-contracts';

export type ApplyLayoutPdfResult = {
  buffer: Buffer;
  pageCount: number;
  appliedCount: number;
  skippedCount: number;
};

function insertBlankPages(
  pdfDoc: PDFDocument,
  insertions: LayoutBlankInsertion[],
  pageSize: { width: number; height: number },
): void {
  const sorted = [...insertions].sort((a, b) => b.afterPage - a.afterPage);
  for (const insertion of sorted) {
    for (let index = 0; index < insertion.count; index += 1) {
      pdfDoc.insertPage(insertion.afterPage, [pageSize.width, pageSize.height]);
    }
  }
}

function appendTrailingBlankPages(
  pdfDoc: PDFDocument,
  initialPageCount: number,
  maxObjectPage: number,
  pageSize: { width: number; height: number },
): void {
  if (initialPageCount <= 0) return;
  for (let page = initialPageCount + 1; page <= maxObjectPage; page += 1) {
    pdfDoc.addPage([pageSize.width, pageSize.height]);
  }
}

function parseImageDataUrl(dataUrl: string): { mime: string; bytes: Uint8Array } {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl.trim());
  if (!match) {
    throw new Error('Некорректный формат изображения (ожидается data URL PNG или JPEG)');
  }
  const mime = match[1]!.toLowerCase();
  if (!mime.includes('png') && !mime.includes('jpeg') && !mime.includes('jpg')) {
    throw new Error('Поддерживаются только PNG и JPEG');
  }
  return { mime, bytes: Buffer.from(match[2]!, 'base64') };
}

function drawPageChrome(
  page: ReturnType<PDFDocument['getPage']>,
  pageIndex: number,
  pageCount: number,
  chrome: LayoutPageChrome | undefined,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
): void {
  if (!chrome) return;
  const { width, height } = page.getSize();
  const fontSize = 9;
  const margin = 24;
  const startPageNumber = chrome.startPageNumber ?? 1;

  const header = formatLayoutPageChromeText(chrome.headerText, pageIndex + 1, pageCount, startPageNumber);
  if (header) {
    const textWidth = font.widthOfTextAtSize(header, fontSize);
    page.drawText(header, {
      x: Math.max(margin, (width - textWidth) / 2),
      y: height - margin,
      size: fontSize,
      font,
      color: rgb(0.35, 0.35, 0.35),
    });
  }

  const footerParts: string[] = [];
  const footerTemplate = formatLayoutPageChromeText(
    chrome.footerText,
    pageIndex + 1,
    pageCount,
    startPageNumber,
  );
  if (footerTemplate) footerParts.push(footerTemplate);
  if (chrome.showPageNumbers) {
    footerParts.push(String(startPageNumber + pageIndex));
  }
  const footer = footerParts.join(' · ');
  if (footer) {
    const textWidth = font.widthOfTextAtSize(footer, fontSize);
    page.drawText(footer, {
      x: Math.max(margin, (width - textWidth) / 2),
      y: margin - fontSize,
      size: fontSize,
      font,
      color: rgb(0.35, 0.35, 0.35),
    });
  }
}

export async function applyLayoutToPdfBuffer(
  sourceBuffer: Buffer,
  objects: LayoutImageObject[],
  blankInsertions: LayoutBlankInsertion[] = [],
  pageChrome?: LayoutPageChrome,
): Promise<ApplyLayoutPdfResult> {
  if (objects.length === 0) {
    throw new Error('Нет объектов макета для сохранения');
  }

  const pdfDoc = await PDFDocument.load(sourceBuffer, { ignoreEncryption: true });
  const initialPageCount = pdfDoc.getPageCount();
  const firstPage = initialPageCount > 0 ? pdfDoc.getPage(0) : null;
  const pageSize = firstPage?.getSize() ?? { width: 595, height: 842 };

  if (blankInsertions.length > 0) {
    insertBlankPages(pdfDoc, blankInsertions, pageSize);
  }

  const maxObjectPage = objects.reduce((max, object) => Math.max(max, object.page), 0);
  appendTrailingBlankPages(pdfDoc, pdfDoc.getPageCount(), maxObjectPage, pageSize);
  const pageCount = pdfDoc.getPageCount();
  const captionFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  let appliedCount = 0;
  let skippedCount = 0;

  for (const object of objects) {
    if (object.page < 1 || object.page > pageCount) {
      skippedCount++;
      continue;
    }

    const page = pdfDoc.getPage(object.page - 1);
    const { width: pageWidth, height: pageHeight } = page.getSize();
    const { mime, bytes } = parseImageDataUrl(object.imageSrc);
    const image = mime.includes('png') ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);

    const draw = computeLayoutImageDrawParams(
      object.rect,
      pageWidth,
      pageHeight,
      object.rotation ?? 0,
    );

    page.drawImage(image, {
      x: draw.x,
      y: draw.y,
      width: draw.width,
      height: draw.height,
      rotate: degrees(draw.rotationDeg),
    });

    const caption = object.caption?.trim();
    if (caption) {
      const fontSize = Math.max(7, Math.min(11, draw.width * 0.04));
      const maxWidth = draw.width * 0.95;
      let text = caption;
      while (text.length > 1 && captionFont.widthOfTextAtSize(text, fontSize) > maxWidth) {
        text = text.slice(0, -1);
      }
      if (text.length < caption.length) text = `${text.slice(0, Math.max(0, text.length - 1))}…`;
      const textWidth = captionFont.widthOfTextAtSize(text, fontSize);
      page.drawText(text, {
        x: draw.x + (draw.width - textWidth) / 2,
        y: Math.max(4, draw.y - fontSize - 2),
        size: fontSize,
        font: captionFont,
        color: rgb(0.2, 0.2, 0.2),
      });
    }

    appliedCount++;
  }

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    drawPageChrome(pdfDoc.getPage(pageIndex), pageIndex, pageCount, pageChrome, captionFont);
  }

  if (appliedCount === 0) {
    throw new Error('Ни один объект не попал на допустимые страницы PDF');
  }

  const buffer = Buffer.from(
    await pdfDoc.save({
      useObjectStreams: true,
      addDefaultPage: false,
    }),
  );

  return { buffer, pageCount, appliedCount, skippedCount };
}
