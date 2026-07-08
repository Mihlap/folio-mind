import type { LayoutPageObject } from '@folio-mind/store';

export function countLayoutObjectsByPage(
  objects: LayoutPageObject[],
): Record<number, number> {
  const counts: Record<number, number> = {};
  for (const object of objects) {
    counts[object.page] = (counts[object.page] ?? 0) + 1;
  }
  return counts;
}

export function formatLayoutAddSummary(created: LayoutPageObject[]): string {
  if (created.length === 0) return '';
  if (created.length === 1) {
    return `Добавлена 1 картинка на стр. ${created[0]!.page}. Перетащите её на листе.`;
  }

  const byPage = countLayoutObjectsByPage(created);
  const pages = Object.keys(byPage)
    .map(Number)
    .sort((a, b) => a - b);

  if (pages.length === 1) {
    const page = pages[0]!;
    return `Добавлено ${created.length} картинок на стр. ${page} — они слегка смещены, разведите по листу.`;
  }

  const pageList = pages.map((page) => `${page} (${byPage[page]})`).join(', ');
  return `Добавлено ${created.length} картинок на стр. ${pageList}. Откройте страницу по ссылке ниже.`;
}
