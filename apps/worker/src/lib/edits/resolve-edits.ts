import {
  readContentFormat,
  resolveEditSuggestion,
  type EditContentFormat,
} from '@folio-mind/edit-markdown';

export type ResolvedSourceEdit = {
  originalText: string;
  suggestion: string;
  contentFormat: EditContentFormat;
  page: number;
  anchor?: { xNorm: number; yNorm: number };
};

export function resolveEditsForPdfOverlay(edits: ResolvedSourceEdit[]) {
  return edits.map((edit) => {
    const resolved = resolveEditSuggestion(edit.suggestion, edit.contentFormat);
    return {
      page: edit.page,
      originalText: edit.originalText,
      suggestion: resolved.plain,
      anchor: edit.anchor,
    };
  });
}

export function resolveEditsForDocx(edits: ResolvedSourceEdit[]) {
  return edits.map((edit) => {
    const resolved = resolveEditSuggestion(edit.suggestion, edit.contentFormat);
    return {
      originalText: edit.originalText,
      suggestion: edit.suggestion,
      suggestionPlain: resolved.docxPlain,
      suggestionRunsXml: resolved.docxRunsXml,
      contentFormat: edit.contentFormat,
      page: edit.page,
    };
  });
}

export function resolveSuggestionPlain(
  suggestion: string,
  meta: unknown,
): string {
  return resolveEditSuggestion(suggestion, readContentFormat(meta)).plain;
}
