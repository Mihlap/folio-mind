import { describe, expect, it } from 'vitest';
import { applyEditsToDocx } from './apply-edits.js';
import { highlightEditsInDocx } from './highlight-edits.js';

async function buildDocx(documentXml: string): Promise<Buffer> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);
  zip.file('word/document.xml', documentXml);
  return Buffer.from(await zip.generateAsync({ type: 'nodebuffer' }));
}

function countParagraphOpenTags(xml: string): number {
  let open = 0;
  let pos = 0;
  while (pos < xml.length) {
    const found = xml.indexOf('<w:p', pos);
    if (found < 0) break;
    const next = xml[found + 4];
    if (next === '>' || next === ' ' || next === '\t' || next === '\n' || next === '\r') {
      open++;
    }
    pos = found + 4;
  }
  return open;
}

function expectWellFormedParagraphs(xml: string): void {
  const open = countParagraphOpenTags(xml);
  const close = (xml.match(/<\/w:p>/g) ?? []).length;
  expect(open).toBe(close);
  expect(xml).toContain('</w:body>');
  expect(xml).toContain('</w:document>');
}

describe('highlightEditsInDocx', () => {
  it('подсвечивает только финальный текст правки', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/></w:rPr>
        <w:t>Текст для подсветки</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;
    const docx = await buildDocx(xml);
    const { highlightedDocx, highlighted } = await highlightEditsInDocx(docx, [
      {
        originalText: 'Текст для подсветки',
        suggestion: '&bullet; новый пункт',
        contentFormat: 'markdown',
        page: 1,
      },
    ]);
    expect(highlighted).toBe(1);
    const JSZip = (await import('jszip')).default;
    const out = await JSZip.loadAsync(highlightedDocx);
    const result = await out.file('word/document.xml')!.async('string');
    expect(result).toContain('<w:highlight w:val="yellow"/>');
    expect(result).toContain('новый пункт');
    expect(result).not.toContain('Текст для подсветки');
    expect(result).not.toContain('<w:color w:val="008000"/>');
    expect(result).not.toContain('→');
    expect(result).toContain('Times New Roman');
    expectWellFormedParagraphs(result);
  });

  it('сохраняет валидный XML при w:pPr и не удаляет абзац ниже', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr><w:spacing w:after="200"/></w:pPr>
      <w:r><w:t>First line second line third line in one paragraph.</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:spacing w:after="200"/></w:pPr>
      <w:r><w:t>Paragraph below must remain.</w:t></w:r>
    </w:p>
  </w:body>
</w:document>`;
    const docx = await buildDocx(xml);
    const { highlightedDocx, highlighted } = await highlightEditsInDocx(docx, [
      {
        originalText: 'First line\nsecond line\nthird line in one paragraph.',
        suggestion: 'Replaced paragraph text here.',
        page: 1,
      },
    ]);
    expect(highlighted).toBe(1);
    const JSZip = (await import('jszip')).default;
    const out = await JSZip.loadAsync(highlightedDocx);
    const result = await out.file('word/document.xml')!.async('string');
    expect(result).toContain('Replaced paragraph text here.');
    expect(result).toContain('Paragraph below must remain.');
    expectWellFormedParagraphs(result);
    expect(countParagraphOpenTags(result)).toBe(2);
  });

  it('подсвечивает многострочный список финальным текстом', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Slovníku jazyka</w:t></w:r></w:p>
    <w:p><w:r><w:t>kaˆ tîn qerapÒntwn</w:t></w:r></w:p>
  </w:body>
</w:document>`;
    const docx = await buildDocx(xml);
    const { highlightedDocx, highlighted } = await highlightEditsInDocx(docx, [
      {
        originalText: 'Slovníku jazyka\nkaˆ tîn qerapÒntwn',
        suggestion: '• Slovníku jazyka\n• kaˆ tîn qerapÒntwn\n• nový bod',
        contentFormat: 'markdown',
        page: 1,
      },
    ]);
    expect(highlighted).toBe(1);
    const JSZip = (await import('jszip')).default;
    const out = await JSZip.loadAsync(highlightedDocx);
    const result = await out.file('word/document.xml')!.async('string');
    expect(result).toContain('<w:highlight w:val="yellow"/>');
    expect(result).toContain('nový bod');
    expect(result).not.toContain('<w:color w:val="008000"/>');
    expect(result).not.toContain('→');
    expectWellFormedParagraphs(result);
  });
});

describe('applyEditsToDocx font preservation', () => {
  it('сохраняет шрифт при добавлении пункта списка', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/></w:rPr>
        <w:t>Slovníku jazyka</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:r>
        <w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/></w:rPr>
        <w:t>kaˆ tîn qerapÒntwn</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;
    const docx = await buildDocx(xml);
    const { modifiedDocx, applied } = await applyEditsToDocx(docx, [
      {
        originalText: 'Slovníku jazyka\nkaˆ tîn qerapÒntwn',
        suggestion: '• Slovníku jazyka\n• kaˆ tîn qerapÒntwn\n• nový bod',
        suggestionPlain: '• Slovníku jazyka\n• kaˆ tîn qerapÒntwn\n• nový bod',
        page: 1,
      },
    ]);
    expect(applied).toBe(1);
    const JSZip = (await import('jszip')).default;
    const out = await JSZip.loadAsync(modifiedDocx);
    const result = await out.file('word/document.xml')!.async('string');
    expect(result).toContain('nový bod');
    expect(result.match(/Times New Roman/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });
});
