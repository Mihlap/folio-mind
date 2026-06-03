import { extractedTextKey, type PageText } from '@folio-mind/pdf-contracts';
import { extractTextFromPdf } from './pdf-text.js';
import { tryGetObjectBuffer } from '../storage/s3.js';

export async function loadDocumentText(
  documentId: string,
  versionId: string,
  pdfBuffer: Buffer,
): Promise<string> {
  const textJson = await tryGetObjectBuffer(extractedTextKey(documentId, versionId));
  if (textJson) {
    try {
      const parsed = JSON.parse(textJson.toString('utf8')) as { text?: string; pages?: PageText[] };
      if (parsed.pages?.length) {
        return parsed.pages.map((p) => p.text).join('\n\n');
      }
      if (parsed.text?.trim()) return parsed.text;
    } catch {
      /* fallback to live extraction */
    }
  }
  const extracted = await extractTextFromPdf(pdfBuffer);
  return extracted.text;
}
