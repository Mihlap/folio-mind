import {
  comparePageLayoutSignatures,
  scoreApplyEditsConfidence,
  scoreDocxReflowConfidence,
  type ApplyEditsMethod,
  type ConfidenceResult,
} from '@folio-mind/pdf-contracts';
import { getObjectBuffer } from '../storage/s3.js';
import { extractPageLayoutSignatures } from './find-text-positions.js';
import { extractTextFromPdf } from './pdf-text.js';

type Edit = {
  page: number;
};

export async function computeApplyEditsConfidence(params: {
  sourceS3Key: string;
  targetPdfBuffer: Buffer;
  edits: Edit[];
  method: ApplyEditsMethod;
}): Promise<ConfidenceResult> {
  const sourceBuffer = await getObjectBuffer(params.sourceS3Key);
  const editedPages = [...new Set(params.edits.map((e) => e.page))];

  if (params.method === 'docx' || params.method === 'docx-converted') {
    const [sourceExtracted, targetExtracted] = await Promise.all([
      extractTextFromPdf(sourceBuffer),
      extractTextFromPdf(params.targetPdfBuffer),
    ]);
    return scoreDocxReflowConfidence({
      sourcePageCount: sourceExtracted.pageCount,
      targetPageCount: targetExtracted.pageCount,
      editedPages,
      method: params.method,
    });
  }

  const [sourceExtracted, targetExtracted, sourceLayout, targetLayout] = await Promise.all([
    extractTextFromPdf(sourceBuffer),
    extractTextFromPdf(params.targetPdfBuffer),
    extractPageLayoutSignatures(sourceBuffer),
    extractPageLayoutSignatures(params.targetPdfBuffer),
  ]);
  const layout = comparePageLayoutSignatures({
    source: sourceLayout,
    target: targetLayout,
    editedPages,
  });
  return scoreApplyEditsConfidence({
    sourcePageCount: sourceExtracted.pageCount,
    targetPageCount: targetExtracted.pageCount,
    sourcePages: sourceExtracted.pages,
    targetPages: targetExtracted.pages,
    editedPages,
    method: params.method,
    layoutPagesChecked: layout.layoutPagesChecked,
    layoutDriftPages: layout.layoutDriftPages,
  });
}
