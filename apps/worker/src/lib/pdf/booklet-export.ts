import JSZip from 'jszip';
import {
  BOOKLET_EXPORT_MAX_PAGES,
  exportBookletZipKey,
  exportPagesZipKey,
  MSG_ARCHIVE_PDF_FALLBACK,
  type BookletExportImageFormat,
  type BookletExportJobResult,
  type PagesExportJobResult,
} from '@folio-mind/pdf-contracts';
import { analyzePrintReadiness } from './print-readiness.js';
import { renderPdfPagesAtDpi } from './pdf-previews.js';
import { tryConvertPdfA } from './pdf-to-pdfa.js';

export async function buildBookletExportZip(params: {
  documentId: string;
  versionId: string;
  pdfBuffer: Buffer;
  jpegDpi: number;
  pdfA: boolean;
  title: string;
}): Promise<{ zipBuffer: Buffer; result: Omit<BookletExportJobResult, 'zipS3Key'> }> {
  const { documentId, versionId, pdfBuffer, jpegDpi, pdfA, title } = params;
  const readiness = await analyzePrintReadiness(pdfBuffer);
  const pageCount = readiness.pageCount;
  if (pageCount === 0) {
    throw new Error('PDF не содержит страниц');
  }
  if (pageCount > BOOKLET_EXPORT_MAX_PAGES) {
    throw new Error(`Слишком много страниц (${pageCount}). Лимит экспорта: ${BOOKLET_EXPORT_MAX_PAGES}.`);
  }

  let finalPdf = pdfBuffer;
  let pdfAApplied = false;
  if (pdfA) {
    const converted = await tryConvertPdfA(pdfBuffer);
    if (converted) {
      finalPdf = converted;
      pdfAApplied = true;
    }
  }

  const pages = Array.from({ length: pageCount }, (_, i) => i + 1);
  const images = await renderPdfPagesAtDpi(finalPdf, pages, jpegDpi, 'jpeg', 0.88);

  const zip = new JSZip();
  zip.file('document.pdf', finalPdf);
  zip.file(
    'manifest.json',
    JSON.stringify(
      {
        title,
        documentId,
        versionId,
        pageCount,
        jpegDpi,
        pdfARequested: pdfA,
        pdfAApplied,
        generatedAt: new Date().toISOString(),
        printReadiness: readiness,
      },
      null,
      2,
    ),
  );
  zip.file('print-readiness.json', JSON.stringify(readiness, null, 2));

  for (const { page, image } of images) {
    zip.file(`pages/page-${String(page).padStart(3, '0')}.jpg`, image);
  }

  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  return {
    zipBuffer,
    result: {
      pageCount,
      jpegDpi,
      pdfA,
      pdfAApplied,
      printReadiness: readiness,
      message:
        pdfA && !pdfAApplied ? MSG_ARCHIVE_PDF_FALLBACK : `Пакет готов: PDF + ${images.length} JPG (${jpegDpi} dpi).`,
    },
  };
}

export function bookletZipKey(documentId: string, versionId: string): string {
  return exportBookletZipKey(documentId, versionId);
}

export async function buildPagesExportZip(params: {
  pdfBuffer: Buffer;
  pages: number[];
  format: BookletExportImageFormat;
  dpi: number;
}): Promise<{ zipBuffer: Buffer; result: Omit<PagesExportJobResult, 'zipS3Key'> }> {
  const { pdfBuffer, pages, format, dpi } = params;
  if (pages.length === 0) {
    throw new Error('Укажите номера страниц');
  }
  const images = await renderPdfPagesAtDpi(pdfBuffer, pages, dpi, format, 0.9);
  if (images.length === 0) {
    throw new Error('Не удалось отрендерить выбранные страницы');
  }

  const zip = new JSZip();
  const ext = format === 'jpeg' ? 'jpg' : 'png';
  for (const { page, image } of images) {
    zip.file(`page-${String(page).padStart(3, '0')}.${ext}`, image);
  }
  zip.file(
    'manifest.json',
    JSON.stringify(
      {
        pages: images.map((item) => item.page),
        format,
        dpi,
        generatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );

  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  return {
    zipBuffer,
    result: {
      pages: images.map((item) => item.page),
      format,
      dpi,
      message: `Экспорт ${images.length} стр. (${format.toUpperCase()}, ${dpi} dpi).`,
    },
  };
}

export function pagesZipKey(documentId: string, versionId: string): string {
  return exportPagesZipKey(documentId, versionId);
}
