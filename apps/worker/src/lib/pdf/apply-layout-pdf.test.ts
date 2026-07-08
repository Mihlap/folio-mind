import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import type { LayoutImageObject } from '@folio-mind/pdf-contracts';
import { applyLayoutToPdfBuffer } from './apply-layout-pdf.js';

/** 1×1 красный PNG */
const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('applyLayoutToPdfBuffer', () => {
  it('draws image objects onto PDF pages', async () => {
    const source = await PDFDocument.create();
    source.addPage([300, 400]);
    source.addPage([300, 400]);
    const sourceBuffer = Buffer.from(await source.save());

    const objects: LayoutImageObject[] = [
      {
        id: 'a',
        page: 1,
        imageSrc: TINY_PNG_DATA_URL,
        rotation: 0,
        rect: { x: 0.1, y: 0.1, width: 0.3, height: 0.3 },
      },
      {
        id: 'b',
        page: 2,
        imageSrc: TINY_PNG_DATA_URL,
        rotation: 0,
        rect: { x: 0.2, y: 0.2, width: 0.2, height: 0.2 },
      },
    ];

    const result = await applyLayoutToPdfBuffer(sourceBuffer, objects);
    expect(result.appliedCount).toBe(2);
    expect(result.pageCount).toBe(2);
    expect(result.buffer.length).toBeGreaterThan(sourceBuffer.length);

    const out = await PDFDocument.load(result.buffer);
    expect(out.getPageCount()).toBe(2);
  });

  it('rejects empty object list', async () => {
    const source = await PDFDocument.create();
    source.addPage([200, 200]);
    const sourceBuffer = Buffer.from(await source.save());
    await expect(applyLayoutToPdfBuffer(sourceBuffer, [])).rejects.toThrow(/Нет объектов/);
  });
});
