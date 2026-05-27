import { createCanvas } from '@napi-rs/canvas';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';

const require = createRequire(import.meta.url);
const pdfjsPkgDir = dirname(require.resolve('pdfjs-dist/package.json'));

GlobalWorkerOptions.workerSrc = pathToFileURL(
  join(pdfjsPkgDir, 'legacy/build/pdf.worker.mjs'),
).href;

const THUMB_WIDTH = 160;
const DEFAULT_INITIAL_PAGES = 15;
const DEFAULT_MAX_PREVIEW_PAGES = 200;

function resolveInitialPages(): number {
  const raw = process.env.PREVIEW_INITIAL_PAGES;
  if (!raw) return DEFAULT_INITIAL_PAGES;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_INITIAL_PAGES;
}

function resolveMaxPreviewPages(): number {
  const raw = process.env.PREVIEW_MAX_PAGES;
  if (!raw) return DEFAULT_MAX_PREVIEW_PAGES;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_MAX_PREVIEW_PAGES;
}

export type PreviewRenderResult = {
  pageCount: number;
  previews: Array<{ page: number; png: Buffer }>;
  initialPages: number;
};

async function openPdf(buffer: Buffer) {
  const task = getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    standardFontDataUrl: `${pathToFileURL(join(pdfjsPkgDir, 'standard_fonts')).href}/`,
  });
  return task.promise;
}

export async function countPdfPages(buffer: Buffer): Promise<number> {
  const pdf = await openPdf(buffer);
  const pageCount = pdf.numPages;
  await pdf.destroy();
  return pageCount;
}

export async function renderPdfPageRange(
  buffer: Buffer,
  fromPage: number,
  toPage: number,
): Promise<Array<{ page: number; png: Buffer }>> {
  const pdf = await openPdf(buffer);
  const start = Math.max(1, fromPage);
  const end = Math.min(pdf.numPages, toPage);
  const previews: Array<{ page: number; png: Buffer }> = [];

  for (let pageNum = start; pageNum <= end; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = THUMB_WIDTH / baseViewport.width;
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2d context unavailable');

    await page.render({
      canvasContext: context,
      viewport,
      canvas,
    } as Parameters<typeof page.render>[0]).promise;

    previews.push({ page: pageNum, png: canvas.toBuffer('image/png') });
  }

  await pdf.destroy();
  return previews;
}

/** Первичная генерация: текст + миниатюры только для первых N страниц. */
export async function renderPdfPreviews(buffer: Buffer): Promise<PreviewRenderResult> {
  const pdf = await openPdf(buffer);
  const pageCount = pdf.numPages;
  await pdf.destroy();

  const initialPages = Math.min(pageCount, resolveInitialPages());
  const previews = initialPages > 0 ? await renderPdfPageRange(buffer, 1, initialPages) : [];

  return { pageCount, previews, initialPages };
}

export function getPreviewLimits() {
  return {
    initialPages: resolveInitialPages(),
    maxPages: resolveMaxPreviewPages(),
  };
}
