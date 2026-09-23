import { diffLines } from 'diff';
import type { PageText } from './extracted-text.js';

export type TextDiffLine = {
  type: 'equal' | 'insert' | 'delete';
  text: string;
};
export type PageDiffStatus = 'unchanged' | 'modified' | 'added' | 'removed';
export type PageTextDiff = {
  page: number;
  status: PageDiffStatus;
  baseText?: string;
  compareText?: string;
  lines?: TextDiffLine[];
};
export type VersionTextCompareSummary = {
  unchangedPages: number;
  modifiedPages: number;
  addedPages: number;
  removedPages: number;
};
export type VersionTextCompareResult = {
  summary: VersionTextCompareSummary;
  pages: PageTextDiff[];
};
export type CompareVersionTextsOptions = {
  editedPages?: ReadonlySet<number>;

  strict?: boolean;
};

function pageTextMap(pages: PageText[]): Map<number, string> {
  return new Map(pages.map((p) => [p.page, p.text]));
}

export function normalizePageTextForCompare(text: string): string {
  return text
    .replace(/\u00A0/g, ' ')
    .replace(/\u00AD/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeForCompare(text: string): string[] {
  return normalizePageTextForCompare(text)
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 0);
}

function wordSignature(text: string): string {
  return tokenizeForCompare(text).sort().join('\u0001');
}

function tokenMultisetSimilarity(baseText: string, compareText: string): number {
  const a = tokenizeForCompare(baseText);
  const b = tokenizeForCompare(compareText);
  const countsA = new Map<string, number>();
  const countsB = new Map<string, number>();
  for (const token of a) countsA.set(token, (countsA.get(token) ?? 0) + 1);
  for (const token of b) countsB.set(token, (countsB.get(token) ?? 0) + 1);
  let inter = 0;
  let union = 0;
  for (const [token, countA] of countsA) {
    const countB = countsB.get(token) ?? 0;
    inter += Math.min(countA, countB);
    union += Math.max(countA, countB);
  }
  for (const [token, countB] of countsB) {
    if (!countsA.has(token)) union += countB;
  }
  return union > 0 ? inter / union : 1;
}

function hasSubstantiveTextDiff(
  baseText: string,
  compareText: string,
  options?: { lenient?: boolean },
): boolean {
  const base = normalizePageTextForCompare(baseText);
  const compare = normalizePageTextForCompare(compareText);
  if (base === compare) return false;
  if (wordSignature(baseText) === wordSignature(compareText)) return false;

  const jaccard = tokenMultisetSimilarity(baseText, compareText);
  if (options?.lenient && jaccard >= 0.88) return false;

  const lines = diffPageLines(base, compare);
  const hasLineChanges = lines.some((line) => {
    if (line.type === 'equal') return false;
    return line.text.replace(/\s+/g, '').length > 0;
  });
  if (!hasLineChanges) return false;

  if (options?.lenient && jaccard >= 0.8) return false;

  return true;
}

export function arePageTextsEquivalent(baseText: string, compareText: string): boolean {
  return !hasSubstantiveTextDiff(baseText, compareText);
}

export function diffPageLines(baseText: string, compareText: string): TextDiffLine[] {
  const changes = diffLines(baseText, compareText, { newlineIsToken: false });
  const lines: TextDiffLine[] = [];
  for (const change of changes) {
    const parts = change.value.replace(/\r\n/g, '\n').split('\n');
    if (parts.length > 0 && parts[parts.length - 1] === '') {
      parts.pop();
    }
    for (const part of parts) {
      if (change.added) {
        lines.push({ type: 'insert', text: part });
      } else if (change.removed) {
        lines.push({ type: 'delete', text: part });
      } else {
        lines.push({ type: 'equal', text: part });
      }
    }
  }
  return lines;
}

export function compareVersionTexts(
  basePages: PageText[],
  comparePages: PageText[],
  options?: CompareVersionTextsOptions,
): VersionTextCompareResult {
  const editedPages = options?.editedPages ?? new Set<number>();
  const baseMap = pageTextMap(basePages);
  const compareMap = pageTextMap(comparePages);
  const pageNumbers = new Set([...baseMap.keys(), ...compareMap.keys()]);
  const summary: VersionTextCompareSummary = {
    unchangedPages: 0,
    modifiedPages: 0,
    addedPages: 0,
    removedPages: 0,
  };
  const pages: PageTextDiff[] = [];
  for (const page of [...pageNumbers].sort((a, b) => a - b)) {
    const baseText = baseMap.get(page);
    const compareText = compareMap.get(page);
    if (baseText === undefined && compareText !== undefined) {
      summary.addedPages += 1;
      pages.push({ page, status: 'added', compareText });
      continue;
    }
    if (baseText !== undefined && compareText === undefined) {
      summary.removedPages += 1;
      pages.push({ page, status: 'removed', baseText });
      continue;
    }
    if (baseText === undefined && compareText === undefined) {
      continue;
    }
    const normalizedBase = normalizePageTextForCompare(baseText!);
    const normalizedCompare = normalizePageTextForCompare(compareText!);
    const lenient = !options?.strict && !editedPages.has(page);
    if (!hasSubstantiveTextDiff(baseText!, compareText!, { lenient })) {
      summary.unchangedPages += 1;
      pages.push({
        page,
        status: 'unchanged',
        baseText: normalizedBase,
        compareText: normalizedCompare,
      });
      continue;
    }
    summary.modifiedPages += 1;
    pages.push({
      page,
      status: 'modified',
      baseText: normalizedBase,
      compareText: normalizedCompare,
      lines: diffPageLines(normalizedBase, normalizedCompare),
    });
  }
  return { summary, pages };
}
