import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import { computeLayoutImageDrawParams, type LayoutImageObject } from '@folio-mind/pdf-contracts';

export type ApplyLayoutPdfResult = {
  buffer: Buffer;
  pageCount: number;
  appliedCount: number;
  skippedCount: number;
};

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

export async function applyLayoutToPdfBuffer(
  sourceBuffer: Buffer,
  objects: LayoutImageObject[],
): Promise<ApplyLayoutPdfResult> {
  if (objects.length === 0) {
    throw new Error('Нет объектов макета для сохранения');
  }

  const pdfDoc = await PDFDocument.load(sourceBuffer, { ignoreEncryption: true });
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
