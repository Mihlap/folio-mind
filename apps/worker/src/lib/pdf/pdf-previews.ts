import { createCanvas, type Canvas } from '@napi-rs/canvas';
import { drawGuestViewWatermark } from './guest-view-watermark.js';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { getDocument, GlobalWorkerOptions, VerbosityLevel } from 'pdfjs-dist/legacy/build/pdf.mjs';
const require = createRequire(import.meta.url);
const pdfjsPkgDir = dirname(require.resolve('pdfjs-dist/package.json'));
GlobalWorkerOptions.workerSrc = pathToFileURL(
  join(pdfjsPkgDir, 'legacy/build/pdf.worker.mjs'),
).href;
const THUMB_WIDTH = 160;
const DEFAULT_VIEW_WIDTH = 1440;
const PIXEL_DIFF_WIDTH = 200;
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
function resolveViewWidth(): number {
  const raw = process.env.PREVIEW_VIEW_WIDTH;
  if (!raw) return DEFAULT_VIEW_WIDTH;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 400 ? Math.floor(n) : DEFAULT_VIEW_WIDTH;
}

export type PreviewRenderResult = {
  pageCount: number;
  previews: Array<{
    page: number;
    thumb: Buffer;
    view: Buffer;
  }>;
  initialPages: number;
};

async function openPdf(buffer: Buffer) {
  const task = getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    disableFontFace: true,
    standardFontDataUrl: `${pathToFileURL(join(pdfjsPkgDir, 'standard_fonts')).href}/`,
    verbosity: VerbosityLevel.ERRORS,
  });
  return task.promise;
}

export async function countPdfPages(buffer: Buffer): Promise<number> {
  const pdf = await openPdf(buffer);
  const pageCount = pdf.numPages;
  await pdf.destroy();
  return pageCount;
}

export type PageRgbaBitmap = {
  page: number;
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

async function renderPageCanvas(
  pdf: Awaited<ReturnType<typeof openPdf>>,
  pageNum: number,
  targetWidth: number,
): Promise<Canvas> {
  const page = await pdf.getPage(pageNum);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = targetWidth / baseViewport.width;
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2d context unavailable');
  await page.render({
    canvasContext: context,
    viewport,
    canvas,
  } as Parameters<typeof page.render>[0]).promise;
  return canvas;
}

function toGuestViewPng(canvas: Canvas): Buffer {
  const context = canvas.getContext('2d');
  if (context) {
    drawGuestViewWatermark(context, canvas.width, canvas.height);
  }
  return canvas.toBuffer('image/png');
}

function downscaleToThumb(source: Canvas): Buffer {
  const targetWidth = THUMB_WIDTH;
  const scale = targetWidth / source.width;
  const targetHeight = Math.max(1, Math.ceil(source.height * scale));
  const thumbCanvas = createCanvas(targetWidth, targetHeight);
  const context = thumbCanvas.getContext('2d');
  if (!context) throw new Error('Canvas 2d context unavailable');
  context.drawImage(source, 0, 0, targetWidth, targetHeight);
  return thumbCanvas.toBuffer('image/png');
}

async function renderPageRgba(
  pdf: Awaited<ReturnType<typeof openPdf>>,
  pageNum: number,
  targetWidth: number,
): Promise<PageRgbaBitmap> {
  const canvas = await renderPageCanvas(pdf, pageNum, targetWidth);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2d context unavailable');
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  return {
    page: pageNum,
    width: canvas.width,
    height: canvas.height,
    data: imageData.data,
  };
}

export async function renderPdfPagesRgba(
  buffer: Buffer,
  pageNumbers: number[],
  targetWidth = PIXEL_DIFF_WIDTH,
): Promise<PageRgbaBitmap[]> {
  if (pageNumbers.length === 0) return [];
  const pdf = await openPdf(buffer);
  const uniquePages = [...new Set(pageNumbers)]
    .filter((p) => p >= 1 && p <= pdf.numPages)
    .sort((a, b) => a - b);
  const results: PageRgbaBitmap[] = [];
  for (const pageNum of uniquePages) {
    results.push(await renderPageRgba(pdf, pageNum, targetWidth));
  }
  await pdf.destroy();
  return results;
}

export async function renderPdfPagesImage(
  buffer: Buffer,
  pageNumbers: number[],
  targetWidth: number,
  format: 'jpeg' | 'png',
  jpegQuality = 0.82,
): Promise<Array<{ page: number; image: Buffer }>> {
  if (pageNumbers.length === 0) return [];
  const pdf = await openPdf(buffer);
  const uniquePages = [...new Set(pageNumbers)]
    .filter((p) => p >= 1 && p <= pdf.numPages)
    .sort((a, b) => a - b);
  const results: Array<{ page: number; image: Buffer }> = [];
  for (const pageNum of uniquePages) {
    const canvas = await renderPageCanvas(pdf, pageNum, targetWidth);
    const image =
      format === 'jpeg'
        ? canvas.toBuffer('image/jpeg', jpegQuality)
        : canvas.toBuffer('image/png');
    results.push({ page: pageNum, image });
  }
  await pdf.destroy();
  return results;
}

export async function renderPdfPagesAtDpi(
  buffer: Buffer,
  pageNumbers: number[],
  dpi: number,
  format: 'jpeg' | 'png',
  jpegQuality = 0.82,
): Promise<Array<{ page: number; image: Buffer }>> {
  if (pageNumbers.length === 0 || dpi <= 0) return [];
  const pdf = await openPdf(buffer);
  const uniquePages = [...new Set(pageNumbers)]
    .filter((p) => p >= 1 && p <= pdf.numPages)
    .sort((a, b) => a - b);
  const results: Array<{ page: number; image: Buffer }> = [];
  for (const pageNum of uniquePages) {
    const page = await pdf.getPage(pageNum);
    const baseViewport = page.getViewport({ scale: 1 });
    const targetWidth = Math.max(1, Math.round((baseViewport.width / 72) * dpi));
    const canvas = await renderPageCanvas(pdf, pageNum, targetWidth);
    const image =
      format === 'jpeg'
        ? canvas.toBuffer('image/jpeg', jpegQuality)
        : canvas.toBuffer('image/png');
    results.push({ page: pageNum, image });
  }
  await pdf.destroy();
  return results;
}

export async function renderPdfPageRange(
  buffer: Buffer,
  fromPage: number,
  toPage: number,
): Promise<
  Array<{
    page: number;
    thumb: Buffer;
    view: Buffer;
  }>
> {
  const pdf = await openPdf(buffer);
  const start = Math.max(1, fromPage);
  const end = Math.min(pdf.numPages, toPage);
  const viewWidth = resolveViewWidth();
  const previews: Array<{ page: number; thumb: Buffer; view: Buffer }> = [];
  for (let pageNum = start; pageNum <= end; pageNum++) {
    const viewCanvas = await renderPageCanvas(pdf, pageNum, viewWidth);
    previews.push({
      page: pageNum,
      view: toGuestViewPng(viewCanvas),
      thumb: downscaleToThumb(viewCanvas),
    });
  }
  await pdf.destroy();
  return previews;
}

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
    viewWidth: resolveViewWidth(),
    thumbWidth: THUMB_WIDTH,
  };
}
