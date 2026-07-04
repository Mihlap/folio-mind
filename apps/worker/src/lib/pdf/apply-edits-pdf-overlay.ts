import { PDFDocument } from 'pdf-lib';
import { getObjectBuffer } from '../storage/s3.js';
import { registerPdfFontkit } from './pdf-cyrillic-font.js';
import { findAllTextPositions } from './find-text-positions.js';
import { renderTextReplacements } from './render-text-replacements.js';
import { PdfEditFontCache } from './pdf-edit-fonts.js';
export type PdfOverlayEdit = {
  page: number;
  originalText: string;
  suggestion: string;
  anchor?: { xNorm: number; yNorm: number };
};
export async function applyEditsViaPdfOverlay(
  sourceS3Key: string,
  edits: PdfOverlayEdit[],
): Promise<{
  buffer: Buffer;
  pageCount: number;
  applied: number;
  failed: number;
}> {
  const pdfBytes = await getObjectBuffer(sourceS3Key);
  const { positions, itemsByPage, fontBytesByName } = await findAllTextPositions(pdfBytes, edits);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  registerPdfFontkit(pdfDoc);
  const fontCache = new PdfEditFontCache();
  const applied = await renderTextReplacements(
    pdfDoc,
    fontCache,
    positions,
    edits,
    itemsByPage,
    fontBytesByName,
  );
  const outputBuffer = Buffer.from(await pdfDoc.save());
  return {
    buffer: outputBuffer,
    pageCount: pdfDoc.getPageCount(),
    applied,
    failed: edits.length - applied,
  };
}
