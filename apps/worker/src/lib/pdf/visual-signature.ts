import { PDFDocument } from 'pdf-lib';

export type VisualSignaturePlacement = {
  page: number;
  xNorm: number;
  yNorm: number;
  widthNorm: number;
  heightNorm: number;
};

export async function applyVisualSignature(
  pdfBuffer: Buffer,
  imagePng: Buffer,
  placement: VisualSignaturePlacement,
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pageIndex = Math.max(0, Math.min(pdfDoc.getPageCount() - 1, placement.page - 1));
  const page = pdfDoc.getPage(pageIndex);
  const { width, height } = page.getSize();
  const img = await pdfDoc.embedPng(imagePng);
  const w = width * placement.widthNorm;
  const h = height * placement.heightNorm;
  const x = width * placement.xNorm;
  const y = height * (1 - placement.yNorm - placement.heightNorm);
  page.drawImage(img, { x, y, width: w, height: h });
  return Buffer.from(await pdfDoc.save());
}
