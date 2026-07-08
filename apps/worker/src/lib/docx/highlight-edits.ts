import JSZip from 'jszip';
import type { DocxEdit } from './apply-edits.js';
import { applyEditsToDocx } from './apply-edits.js';

export type DocxHighlightResult = DocxEdit & {
  status: 'highlighted' | 'failed';
};

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function decorateHighlightedXml(xml: string): string {
  const markerRe = /⟦→ ([^⟧]+)⟧/g;
  return xml.replace(/<w:t(\s[^>]*)?>([^<]*)<\/w:t>/g, (full, attrs, text) => {
    if (!text.includes('⟦→')) return full;
    const attrStr = attrs ?? '';
    const parts = text.split(/(⟦→ [^⟧]+⟧)/);
    const runs = parts
      .map((part: string) => {
        const marker = part.match(/^⟦→ ([^⟧]+)⟧$/);
        if (marker) {
          return `<w:r><w:rPr><w:color w:val="008000"/></w:rPr><w:t xml:space="preserve"> → ${escapeXml(marker[1]!)}</w:t></w:r>`;
        }
        if (!part) return '';
        return `<w:r><w:rPr><w:highlight w:val="yellow"/></w:rPr><w:t${attrStr}>${escapeXml(part)}</w:t></w:r>`;
      })
      .join('');
    return runs || full;
  }).replace(markerRe, '');
}

/**
 * Подсветка правок в DOCX без автозамен: исходная фраза сохраняется,
 * рядом добавляется зелёная пометка «→ предложение».
 */
export async function highlightEditsInDocx(
  docxBuffer: Buffer,
  edits: DocxEdit[],
): Promise<{
  highlightedDocx: Buffer;
  highlighted: number;
  failed: number;
  results: DocxHighlightResult[];
}> {
  const markerEdits = edits.map((edit) => ({
    ...edit,
    suggestion: `${edit.originalText} ⟦→ ${edit.suggestion}⟧`,
  }));
  const { modifiedDocx, applied, failed, results } = await applyEditsToDocx(docxBuffer, markerEdits);
  const zip = await JSZip.loadAsync(modifiedDocx);
  const partPaths = Object.keys(zip.files).filter(
    (name) =>
      !zip.files[name]?.dir &&
      (/^word\/document\.xml$/.test(name) ||
        /^word\/header\d*\.xml$/.test(name) ||
        /^word\/footer\d*\.xml$/.test(name)),
  );
  for (const path of partPaths) {
    const file = zip.file(path);
    if (!file) continue;
    const xml = decorateHighlightedXml(await file.async('string'));
    zip.file(path, xml);
  }
  const highlightedDocx = Buffer.from(
    await zip.generateAsync({
      type: 'nodebuffer',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }),
  );
  return {
    highlightedDocx,
    highlighted: applied,
    failed,
    results: results.map((row) => {
      const source = edits.find(
        (edit) => edit.page === row.page && edit.originalText === row.originalText,
      );
      return {
        page: row.page,
        originalText: row.originalText,
        suggestion: source?.suggestion ?? row.suggestion,
        status: row.status === 'applied' ? ('highlighted' as const) : ('failed' as const),
      };
    }),
  };
}
