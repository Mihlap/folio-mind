import { extractedTextKey } from '@folio-mind/pdf-contracts';
import { extractTextFromPdf } from './pdf-text.js';
import { tryGetObjectBuffer } from './s3.js';

export async function loadDocumentText(
  documentId: string,
  versionId: string,
  pdfBuffer: Buffer,
): Promise<string> {
  const textJson = await tryGetObjectBuffer(extractedTextKey(documentId, versionId));
  if (textJson) {
    try {
      const parsed = JSON.parse(textJson.toString('utf8')) as { text?: string };
      if (parsed.text?.trim()) return parsed.text;
    } catch {
    
    }
  }
  return extractTextFromPdf(pdfBuffer);
}
