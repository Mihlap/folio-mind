export type AcceptedEditRow = {
  page: number;
  quote: string | null;
  content: string;
  meta: unknown;
};

export type AcceptedEditDiffItem = {
  page: number;
  quote: string;
  content: string;
};

export type AcceptedEditsCompareResult = {
  baseCount: number;
  compareCount: number;
  onlyInCompare: AcceptedEditDiffItem[];
  onlyInBase: AcceptedEditDiffItem[];
  modified: Array<{
    page: number;
    baseQuote: string;
    compareQuote: string;
    baseContent: string;
    compareContent: string;
  }>;
};

function editKey(page: number, quote: string, content: string): string {
  const q = quote.replace(/\s+/g, ' ').trim();
  const c = content.replace(/\s+/g, ' ').trim();
  return `${page}\0${q}\0${c}`;
}

function toDiffItem(row: AcceptedEditRow): AcceptedEditDiffItem | null {
  const quote = row.quote?.trim() ?? '';
  const content = row.content.trim();
  if (!quote || !content) return null;
  return { page: row.page, quote, content };
}

function suggestionIdFromMeta(meta: unknown): string | null {
  if (!meta || typeof meta !== 'object') return null;
  const id = (meta as { suggestionId?: unknown }).suggestionId;
  return typeof id === 'string' ? id : null;
}

export function compareAcceptedEdits(
  base: AcceptedEditRow[],
  compare: AcceptedEditRow[],
): AcceptedEditsCompareResult {
  const baseItems = base.map(toDiffItem).filter((x): x is AcceptedEditDiffItem => x !== null);
  const compareItems = compare.map(toDiffItem).filter((x): x is AcceptedEditDiffItem => x !== null);

  const baseKeys = new Set(baseItems.map((e) => editKey(e.page, e.quote, e.content)));
  const compareKeys = new Set(compareItems.map((e) => editKey(e.page, e.quote, e.content)));

  const onlyInCompare = compareItems.filter((e) => !baseKeys.has(editKey(e.page, e.quote, e.content)));
  const onlyInBase = baseItems.filter((e) => !compareKeys.has(editKey(e.page, e.quote, e.content)));

  const modified: AcceptedEditsCompareResult['modified'] = [];
  for (const c of compareItems) {
    const match = baseItems.find(
      (b) => b.page === c.page && b.quote === c.quote && b.content !== c.content,
    );
    if (match) {
      modified.push({
        page: c.page,
        baseQuote: match.quote,
        compareQuote: c.quote,
        baseContent: match.content,
        compareContent: c.content,
      });
    }
  }

  return {
    baseCount: baseItems.length,
    compareCount: compareItems.length,
    onlyInCompare,
    onlyInBase,
    modified,
  };
}

export { suggestionIdFromMeta };
