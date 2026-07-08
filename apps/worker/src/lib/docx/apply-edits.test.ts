import { describe, expect, it } from 'vitest';
import { applyEditsToDocx } from './apply-edits.js';

const paragraphXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r><w:t>Пр</w:t></w:r>
      <w:r><w:t>и подготовке текста статьи в статье не должно быть заголовка статьи, аннотации, ключевых слов на русском и английском языке. Поддерживается ввод файлов формата DOCX.</w:t></w:r>
    </w:p>
  </w:body>
</w:document>`;

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

describe('applyEditsToDocx', () => {
  it('заменяет абзац целиком, не оставляя префикс «Пр» при разбиении runs', async () => {
    const original =
      'При подготовке текста статьи в статье не должно быть заголовка статьи, аннотации, ключевых слов на русском и английском языке. Поддерживается ввод файлов формата DOCX.';
    const suggestion =
      'При подготовке текста статьи в статье не должно быть заголовка статьи, аннотации, ключевых слов на русском и английском языке. hhghrh lrgjrj.';
    const docx = await buildDocx(paragraphXml);
    const { modifiedDocx, applied } = await applyEditsToDocx(docx, [
      { originalText: original, suggestion, page: 1 },
    ]);
    expect(applied).toBe(1);
    const JSZip = (await import('jszip')).default;
    const out = await JSZip.loadAsync(modifiedDocx);
    const xml = await out.file('word/document.xml')!.async('string');
    expect(xml).toContain('hhghrh lrgjrj');
    expect(xml).not.toMatch(/ПрПри/);
    expect(xml).not.toContain('Поддерживается ввод файлов формата DOCX');
  });

  it('возвращает per-edit results и считает failed', async () => {
    const docx = await buildDocx(paragraphXml);
    const { applied, failed, results } = await applyEditsToDocx(docx, [
      {
        originalText: 'несуществующий текст',
        suggestion: 'замена',
        page: 1,
      },
      {
        originalText:
          'При подготовке текста статьи в статье не должно быть заголовка статьи, аннотации, ключевых слов на русском и английском языке. Поддерживается ввод файлов формата DOCX.',
        suggestion: 'Короткая замена.',
        page: 1,
      },
    ]);
    expect(applied).toBe(1);
    expect(failed).toBe(1);
    expect(results).toHaveLength(2);
    expect(results.find((r) => r.status === 'failed')?.originalText).toBe('несуществующий текст');
    expect(results.find((r) => r.status === 'applied')?.suggestion).toBe('Короткая замена.');
  });
});
