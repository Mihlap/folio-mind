import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { getDocument, GlobalWorkerOptions, VerbosityLevel } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import { findAllTextPositions } from './find-text-positions.js';
import { renderTextReplacements } from './render-text-replacements.js';
import { PdfEditFontCache } from './pdf-edit-fonts.js';
import { registerPdfFontkit } from './pdf-cyrillic-font.js';

const require = createRequire(import.meta.url);
const DEJAVU_SERIF = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSerif.ttf');
const pdfjsPkgDir = dirname(require.resolve('pdfjs-dist/package.json'));
GlobalWorkerOptions.workerSrc = pathToFileURL(
  join(pdfjsPkgDir, 'legacy/build/pdf.worker.mjs'),
).href;
const standardFontDataUrl = `${pathToFileURL(join(pdfjsPkgDir, 'standard_fonts')).href}/`;

const LINE1 = 'Пункт 1. ИСПОЛНИТЕЛЬ обязуется выполнить работы.';
const LINE2 = 'Пункт 2. ЗАКАЗЧИК обязуется оплатить работы.';
const LINE3 = 'Пункт 3. Стороны согласовали условия договора.';

async function buildTestPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  registerPdfFontkit(doc);
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(readFileSync(DEJAVU_SERIF));
  for (const [index, text] of [LINE1, LINE2, LINE3].entries()) {
    page.drawText(text, { x: 48, y: 740 - index * 24, size: 12, font });
  }
  return Buffer.from(await doc.save());
}

async function collectPageItems(buffer: Buffer): Promise<Array<{ str: string; height: number }>> {
  const task = getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    disableFontFace: true,
    standardFontDataUrl,
    verbosity: VerbosityLevel.ERRORS,
  });
  const pdf = await task.promise;
  try {
    const page = await pdf.getPage(1);
    const content = await page.getTextContent();
    return content.items.map((entry) => {
      const item = entry as { str?: string; height?: number };
      return { str: String(item.str ?? ''), height: Number(item.height) || 0 };
    });
  } finally {
    await pdf.destroy();
  }
}

function joinItems(items: Array<{ str: string }>): string {
  return items.map((entry) => entry.str).join('');
}

describe('render-text-replacements integration', () => {
  it('replaces a substring without erasing the neighboring words on the same line', async () => {
    const buffer = await buildTestPdf();
    const edits = [{ page: 1, originalText: 'ИСПОЛНИТЕЛЬ', suggestion: 'ПОДРЯДЧИК' }];
    const { positions, itemsByPage, fontBytesByName } = await findAllTextPositions(buffer, edits);

    const match = positions.get(1)?.get('ИСПОЛНИТЕЛЬ')?.[0];
    expect(match).toBeDefined();
    expect(match!.box.width).toBeLessThan(match!.lines[0]!.box.width);

    const doc = await PDFDocument.load(buffer);
    registerPdfFontkit(doc);
    const applied = await renderTextReplacements(
      doc,
      new PdfEditFontCache(),
      positions,
      edits,
      itemsByPage,
      fontBytesByName,
    );
    expect(applied).toBe(1);
    const output = Buffer.from(await doc.save());

    const items = await collectPageItems(output);
    const originalLine = items.find((entry) => entry.str.includes('Пункт 1.'));
    const replacement = items.find((entry) => entry.str.includes('ПОДРЯДЧИК'));
    expect(originalLine?.str).toContain('обязуется выполнить работы');
    expect(replacement?.str).toBe('ПОДРЯДЧИК');
    expect(replacement?.height).toBeGreaterThan(9);
    expect(replacement?.height).toBeLessThan(15);
  });

  it('applies a full-line replacement end to end', async () => {
    const buffer = await buildTestPdf();
    const edits = [
      { page: 1, originalText: LINE2, suggestion: 'Пункт 2. Клиент обязуется оплатить работы.' },
    ];
    const { positions, itemsByPage, fontBytesByName } = await findAllTextPositions(buffer, edits);

    const match = positions.get(1)?.get(LINE2)?.[0];
    expect(match).toBeDefined();
    expect(match!.box.width).toBeGreaterThanOrEqual(match!.lines[0]!.box.width - 1);

    const doc = await PDFDocument.load(buffer);
    registerPdfFontkit(doc);
    const applied = await renderTextReplacements(
      doc,
      new PdfEditFontCache(),
      positions,
      edits,
      itemsByPage,
      fontBytesByName,
    );
    expect(applied).toBe(1);

    const items = await collectPageItems(Buffer.from(await doc.save()));
    expect(joinItems(items)).toContain('Клиент обязуется оплатить');
  });
});