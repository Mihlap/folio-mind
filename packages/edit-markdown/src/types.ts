export type EditContentFormat = 'plain' | 'markdown';

export type AnnotationEditMeta = {
  contentFormat?: EditContentFormat;
  pageAnchor?: { xNorm: number; yNorm: number };
  suggestionId?: string;
  reason?: string;
};

export type ResolvedEditSuggestion = {
  raw: string;
  /** Текст для поиска/наложения в PDF (без разметки). */
  plain: string;
  /** Однострочная замена для DOCX (fallback). */
  docxPlain: string;
  /** OOXML <w:r>…</w:r> для inline-разметки в DOCX; null — только plain. */
  docxRunsXml: string | null;
};
