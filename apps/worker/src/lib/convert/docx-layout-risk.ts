import JSZip from 'jszip';
import {
  classifyDocxLayoutRisk,
  preConvertedDocxRiskKey,
  type DocxLayoutRisk,
  type DocxLayoutRiskStats,
} from '@folio-mind/pdf-contracts';
import { putObjectBuffer } from '../storage/s3.js';
const WORD_DOCUMENT_PATH = 'word/document.xml';
export async function detectDocxLayoutRisk(docxBuffer: Buffer): Promise<DocxLayoutRisk> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(docxBuffer);
  } catch {
    return null;
  }
  const entry = zip.file(WORD_DOCUMENT_PATH);
  if (!entry) return null;
  let xml: string;
  try {
    xml = await entry.async('string');
  } catch {
    return null;
  }
  const stats: DocxLayoutRiskStats = {
    textChars: countTextChars(xml),
    drawings: countOccurrences(xml, '<w:drawing'),
    type3Runs: countOccurrences(xml, 'Type3 ('),
    totalRuns: countOccurrences(xml, '<w:rFonts'),
  };
  return classifyDocxLayoutRisk(stats);
}
export async function storeDocxLayoutRisk(params: {
  docxBuffer: Buffer;
  documentId: string;
  versionId: string;
}): Promise<DocxLayoutRisk> {
  const risk = await detectDocxLayoutRisk(params.docxBuffer);
  await putObjectBuffer({
    key: preConvertedDocxRiskKey(params.documentId, params.versionId),
    body: Buffer.from(JSON.stringify({ risk }), 'utf8'),
    contentType: 'application/json',
  });
  return risk;
}
function countTextChars(xml: string): number {
  let total = 0;
  const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) {
    total += match[1].replace(/<[^>]+>/g, '').length;
  }
  return total;
}
function countOccurrences(xml: string, needle: string): number {
  let count = 0;
  let index = xml.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = xml.indexOf(needle, index + needle.length);
  }
  return count;
}