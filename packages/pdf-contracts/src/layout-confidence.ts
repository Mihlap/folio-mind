export type LayoutPoint = { x: number; y: number };

export type PageLayoutSignature = {
  page: number;
  itemCount: number;
  gridKey: string;
};

export function buildPageLayoutSignature(
  page: number,
  items: LayoutPoint[],
): PageLayoutSignature {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x).slice(0, 24);
  const gridKey = sorted.map((i) => `${Math.round(i.x / 8)},${Math.round(i.y / 8)}`).join('|');
  return { page, itemCount: items.length, gridKey };
}

export function comparePageLayoutSignatures(params: {
  source: PageLayoutSignature[];
  target: PageLayoutSignature[];
  editedPages: number[];
}): { layoutPagesChecked: number; layoutDriftPages: number } {
  const editedSet = new Set(params.editedPages.filter((p) => p >= 1));
  const sourceMap = new Map(params.source.map((s) => [s.page, s]));
  const targetMap = new Map(params.target.map((s) => [s.page, s]));
  const pages = new Set([...sourceMap.keys(), ...targetMap.keys()]);
  let layoutPagesChecked = 0;
  let layoutDriftPages = 0;

  for (const page of pages) {
    if (editedSet.has(page)) continue;
    const source = sourceMap.get(page);
    const target = targetMap.get(page);
    if (!source && !target) continue;
    layoutPagesChecked++;
    const sourceKey = source?.gridKey ?? '';
    const targetKey = target?.gridKey ?? '';
    const sourceCount = source?.itemCount ?? 0;
    const targetCount = target?.itemCount ?? 0;
    const countDelta =
      sourceCount > 0
        ? Math.abs(sourceCount - targetCount) / sourceCount
        : targetCount > 0
          ? 1
          : 0;
    if (sourceKey !== targetKey || countDelta > 0.2) {
      layoutDriftPages++;
    }
  }

  return { layoutPagesChecked, layoutDriftPages };
}
