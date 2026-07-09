import { resolveEditSuggestion } from '@folio-mind/edit-markdown';
import type { ApplyEditsOptions, DocxEdit } from './apply-edits.js';
import { applyEditsToDocx } from './apply-edits.js';

export type DocxHighlightResult = DocxEdit & {
  status: 'highlighted' | 'failed';
};

export async function highlightEditsInDocx(
  docxBuffer: Buffer,
  edits: DocxEdit[],
  options?: ApplyEditsOptions,
): Promise<{
  highlightedDocx: Buffer;
  highlighted: number;
  failed: number;
  results: DocxHighlightResult[];
}> {
  const preparedEdits = edits.map((edit) => {
    const format = edit.contentFormat ?? 'markdown';
    const plainSuggestion = resolveEditSuggestion(edit.suggestion, format).plain;
    return {
      ...edit,
      suggestionPlain: plainSuggestion,
    };
  });
  const { modifiedDocx, applied, failed, results } = await applyEditsToDocx(
    docxBuffer,
    preparedEdits,
    { ...options, mode: 'highlight' },
  );
  return {
    highlightedDocx: modifiedDocx,
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
