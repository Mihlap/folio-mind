import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { detectDocxLayoutRisk } from './docx-layout-risk.js';
async function makeDocx(xml: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('word/document.xml', xml);
  zip.file('[Content_Types].xml', '');
  return Buffer.from(await zip.generateAsync({ type: 'nodebuffer' }));
}
describe('detectDocxLayoutRisk', () => {
  it('flags Type3 deck as deck', async () => {
    const paras = Array.from({ length: 14 }, (_, i) => {
      const runs =
        `<w:r><w:rPr><w:rFonts w:ascii="Type3 (${100 + i} 0 R)"/></w:rPr><w:t>Slide headline and description text ${i + 1}</w:t></w:r>` +
        (i === 12 || i === 13
          ? '<w:r><w:rPr><w:rFonts w:ascii="Type3 (1 0 R)"/></w:rPr><w:drawing/><w:t/></w:r>'
          : '');
      return `<w:p>${runs}</w:p>`;
    }).join('');
    const xml = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paras}</w:body></w:document>`;
    expect(await detectDocxLayoutRisk(await makeDocx(xml))).toBe('deck');
  });
  it('flags image-first docx as images', async () => {
    const paras = Array.from(
      { length: 30 },
      (_, i) =>
        `<w:p><w:r><w:rPr><w:rFonts w:ascii="Calibri"/></w:rPr><w:drawing/><w:t>P${i + 1}</w:t></w:r></w:p>`,
    ).join('');
    const xml = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paras}</w:body></w:document>`;
    expect(await detectDocxLayoutRisk(await makeDocx(xml))).toBe('images');
  });
  it('returns null for a plain text docx', async () => {
    const paras = Array.from(
      { length: 20 },
      (_, i) =>
        `<w:p><w:r><w:rPr><w:rFonts w:ascii="Calibri"/></w:rPr><w:t>Regular paragraph number ${i + 1} with enough body text.</w:t></w:r></w:p>`,
    ).join('');
    const xml = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paras}</w:body></w:document>`;
    expect(await detectDocxLayoutRisk(await makeDocx(xml))).toBeNull();
  });
});