export type EditContentFormat = 'plain' | 'markdown';

export type AnnotationEditMeta = {
  contentFormat?: EditContentFormat;
  pageAnchor?: { xNorm: number; yNorm: number };
  suggestionId?: string;
  reason?: string;
};

export type ResolvedEditSuggestion = {
  raw: string;

  plain: string;

  docxPlain: string;

  docxRunsXml: string | null;
};
