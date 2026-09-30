import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { buildPresentationPdf, type PresentationPdfSlide } from './presentation-pdf.js';

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const baseSlide: PresentationPdfSlide = {
  title: 'Заголовок',
  subtitle: 'Подзаголовок',
  body: 'Первый тезис\nВторой тезис',
  layoutVariant: 'image_top',
  background: null,
  imageBytes: null,
  imageMime: null,
};

async function pageCountOf(buffer: Buffer): Promise<number> {
  const doc = await PDFDocument.load(buffer);
  return doc.getPageCount();
}

describe('buildPresentationPdf', () => {
  it('создаёт по одному листу на слайд', async () => {
    const { buffer, pageCount } = await buildPresentationPdf([
      baseSlide,
      { ...baseSlide, title: 'Второй' },
      { ...baseSlide, title: 'Третий' },
    ]);
    expect(pageCount).toBe(3);
    expect(await pageCountOf(buffer)).toBe(3);
  });

  it('использует формат 16:9 (960×540 pt)', async () => {
    const { buffer } = await buildPresentationPdf([baseSlide]);
    const doc = await PDFDocument.load(buffer);
    const size = doc.getPage(0).getSize();
    expect(Math.round(size.width)).toBe(960);
    expect(Math.round(size.height)).toBe(540);
  });

  it('поддерживает все раскладки', async () => {
    const layouts = ['title_only', 'image_right', 'image_top', 'image_full', 'section'] as const;
    const { buffer, pageCount } = await buildPresentationPdf(
      layouts.map((layoutVariant) => ({ ...baseSlide, layoutVariant })),
    );
    expect(pageCount).toBe(layouts.length);
    expect(await pageCountOf(buffer)).toBe(layouts.length);
  });

  it('переживает пустую презентацию и создаёт один лист', async () => {
    const { buffer, pageCount } = await buildPresentationPdf([]);
    expect(pageCount).toBe(1);
    expect(await pageCountOf(buffer)).toBe(1);
  });

  it('игнорирует неизвестную раскладку', async () => {
    const { buffer } = await buildPresentationPdf([{ ...baseSlide, layoutVariant: 'nope' }]);
    const doc = await PDFDocument.load(buffer);
    expect(doc.getPageCount()).toBe(1);
  });

  it('встраивает PNG в слайд', async () => {
    const withImage = await buildPresentationPdf([
      { ...baseSlide, layoutVariant: 'image_right', imageBytes: TINY_PNG, imageMime: 'image/png' },
    ]);
    const withoutImage = await buildPresentationPdf([{ ...baseSlide, layoutVariant: 'image_right' }]);
    expect(withImage.buffer.length).toBeGreaterThan(withoutImage.buffer.length);
    const doc = await PDFDocument.load(withImage.buffer);
    expect(doc.getPageCount()).toBe(1);
  });

  it('не падает на битом изображении', async () => {
    const { buffer } = await buildPresentationPdf([
      { ...baseSlide, imageBytes: Buffer.from('not-an-image'), imageMime: 'image/png' },
    ]);
    const doc = await PDFDocument.load(buffer);
    expect(doc.getPageCount()).toBe(1);
  });
});
