import {
  compareVersionTexts,
  extractedTextKey,
  parseExtractedTextJson,
  type CompareVersionTextsOptions,
  type PageText,
  type VersionTextCompareResult,
} from '@folio-mind/pdf-contracts';
import { tryGetObjectBuffer } from '../storage/s3.js';
export async function loadVersionPageTexts(
  documentId: string,
  versionId: string,
): Promise<PageText[] | null> {
  const key = extractedTextKey(documentId, versionId);
  const buffer = await tryGetObjectBuffer(key);
  if (!buffer) return null;
  try {
    return parseExtractedTextJson(buffer.toString('utf8')).pages;
  } catch {
    return null;
  }
}
export function buildVersionCompareResult(
  basePages: PageText[],
  comparePages: PageText[],
  options?: CompareVersionTextsOptions,
): VersionTextCompareResult {
  return compareVersionTexts(basePages, comparePages, options);
}
export type { VersionTextCompareResult };
