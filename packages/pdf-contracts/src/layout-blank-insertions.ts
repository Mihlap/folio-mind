export type LayoutBlankInsertion = {
  afterPage: number;
  count: number;
};

export function templatePageSpan(templateObjects: Array<{ page?: number }>): number {
  if (templateObjects.length === 0) return 1;
  return templateObjects.reduce((max, item) => Math.max(max, Number(item.page) || 1), 1);
}

export function sourceAfterFromDisplayAfter(
  displayAfter: number,
  sourcePageCount: number,
  insertions: LayoutBlankInsertion[],
): number {
  const normalized = Math.max(0, Math.floor(displayAfter));
  if (sourcePageCount <= 0) return 0;
  if (normalized <= 0) return 0;

  let displayPtr = 0;
  for (let srcPage = 1; srcPage <= sourcePageCount; srcPage += 1) {
    displayPtr += 1;
    if (displayPtr === normalized) return srcPage;

    const blankCount = insertions.find((item) => item.afterPage === srcPage)?.count ?? 0;
    for (let blank = 0; blank < blankCount; blank += 1) {
      displayPtr += 1;
      if (displayPtr === normalized) return srcPage;
    }
  }

  return sourcePageCount;
}

export function mergeBlankInsertion(
  insertions: LayoutBlankInsertion[],
  afterPage: number,
  count: number,
): LayoutBlankInsertion[] {
  const normalizedAfter = Math.max(0, Math.floor(afterPage));
  const normalizedCount = Math.max(1, Math.floor(count));
  const existing = insertions.find((item) => item.afterPage === normalizedAfter);
  if (existing) {
    return insertions.map((item) =>
      item.afterPage === normalizedAfter
        ? { ...item, count: item.count + normalizedCount }
        : item,
    );
  }
  return [...insertions, { afterPage: normalizedAfter, count: normalizedCount }].sort(
    (a, b) => a.afterPage - b.afterPage,
  );
}

export function totalBlankPages(insertions: LayoutBlankInsertion[]): number {
  return insertions.reduce((sum, item) => sum + item.count, 0);
}
