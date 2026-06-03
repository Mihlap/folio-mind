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

function pageTextMap(pages: PageText[]): Map<number, string> {
  return new Map(pages.map((p) => [p.page, p.text]));
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
): VersionTextCompareResult {
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

    const normalizedBase = baseText!.trim();
    const normalizedCompare = compareText!.trim();

    if (normalizedBase === normalizedCompare) {
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
