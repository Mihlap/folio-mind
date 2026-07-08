import type { PageText } from './extracted-text.js';
import { arePageTextsEquivalent } from './text-diff.js';

export type ConfidenceLevel = 'green' | 'yellow' | 'red';

export type ApplyEditsMethod =
  | 'docx'
  | 'docx-converted'
  | 'pdf-overlay'
  | 'docx-fallback-overlay'
  | 'docx-hybrid';

export type ConfidenceDetails = {
  sourcePageCount: number;
  targetPageCount: number;
  pageCountDelta: number;
  editedPages: number[];
  unchangedPagesChecked: number;
  unchangedPagesDrifted: number;
  layoutPagesChecked?: number;
  layoutDriftPages?: number;
  pixelPagesChecked?: number;
  pixelDriftPages?: number;
  pixelDriftRatio?: number;
  visualDriftPages?: number[];
  method: ApplyEditsMethod;
};

export type ConfidenceResult = ConfidenceDetails & {
  level: ConfidenceLevel;
  score: number;
  summary: string;
};

function pageTextMap(pages: PageText[]): Map<number, string> {
  return new Map(pages.map((p) => [p.page, p.text]));
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** DOCX→Gotenberg переразбивает страницы — постраничное сравнение с исходным PDF некорректно. */
export function scoreDocxReflowConfidence(params: {
  sourcePageCount: number;
  targetPageCount: number;
  editedPages: number[];
  method: 'docx' | 'docx-converted' | 'docx-hybrid';
}): ConfidenceResult {
  const { sourcePageCount, targetPageCount, editedPages, method } = params;
  const pageCountDelta = Math.abs(sourcePageCount - targetPageCount);
  const editedSet = new Set(editedPages.filter((p) => p >= 1));

  let score = 88;
  if (pageCountDelta === 1) score = 78;
  else if (pageCountDelta >= 2) score = 68;
  score = clampScore(score);

  const summary =
    pageCountDelta === 0
      ? 'PDF пересобран из Word. Текст правок на месте, но разбивка страниц может отличаться от исходного PDF — проверьте визуально.'
      : `PDF пересобран из Word (страниц: ${sourcePageCount} → ${targetPageCount}). Номера страниц в аннотациях относятся к исходному PDF — проверьте текст правок в новой версии.`;

  return {
    level: 'yellow',
    score,
    summary,
    sourcePageCount,
    targetPageCount,
    pageCountDelta,
    editedPages: [...editedSet].sort((a, b) => a - b),
    unchangedPagesChecked: 0,
    unchangedPagesDrifted: 0,
    layoutPagesChecked: 0,
    layoutDriftPages: 0,
    pixelPagesChecked: 0,
    pixelDriftPages: 0,
    pixelDriftRatio: 0,
    visualDriftPages: [],
    method,
  };
}

export function scoreApplyEditsConfidence(params: {
  sourcePageCount: number;
  targetPageCount: number;
  sourcePages: PageText[];
  targetPages: PageText[];
  editedPages: number[];
  method: ApplyEditsMethod;
  layoutPagesChecked?: number;
  layoutDriftPages?: number;
  pixelPagesChecked?: number;
  pixelDriftPages?: number;
  pixelDriftRatio?: number;
  visualDriftPages?: number[];
}): ConfidenceResult {
  if (params.method === 'docx' || params.method === 'docx-converted') {
    return scoreDocxReflowConfidence({
      sourcePageCount: params.sourcePageCount,
      targetPageCount: params.targetPageCount,
      editedPages: params.editedPages,
      method: params.method,
    });
  }

  const {
    sourcePageCount,
    targetPageCount,
    sourcePages,
    targetPages,
    editedPages,
    method,
    layoutPagesChecked = 0,
    layoutDriftPages = 0,
    pixelPagesChecked = 0,
    pixelDriftPages = 0,
    pixelDriftRatio = 0,
    visualDriftPages = [],
  } = params;
  const pageCountDelta = Math.abs(sourcePageCount - targetPageCount);
  const editedSet = new Set(editedPages.filter((p) => p >= 1));
  const sourceMap = pageTextMap(sourcePages);
  const targetMap = pageTextMap(targetPages);
  const pageNumbers = new Set<number>([
    ...sourceMap.keys(),
    ...targetMap.keys(),
    ...Array.from({ length: sourcePageCount }, (_, i) => i + 1),
    ...Array.from({ length: targetPageCount }, (_, i) => i + 1),
  ]);

  let unchangedPagesChecked = 0;
  let unchangedPagesDrifted = 0;
  for (const page of pageNumbers) {
    if (editedSet.has(page)) continue;
    const sourceText = sourceMap.get(page) ?? '';
    const targetText = targetMap.get(page) ?? '';
    if (!sourceText && !targetText) continue;
    unchangedPagesChecked++;
    if (!arePageTextsEquivalent(sourceText, targetText)) {
      unchangedPagesDrifted++;
    }
  }

  const driftRatio =
    unchangedPagesChecked > 0 ? unchangedPagesDrifted / unchangedPagesChecked : 0;

  const layoutDriftRatio =
    layoutPagesChecked > 0 ? layoutDriftPages / layoutPagesChecked : 0;

  let score = 100;
  if (pageCountDelta > 1) score -= 45;
  else if (pageCountDelta === 1) score -= 22;
  score -= Math.min(40, unchangedPagesDrifted * 10);
  score -= Math.min(25, layoutDriftPages * 8);
  score -= Math.min(30, pixelDriftPages * 10);
  if (pixelDriftRatio > 0.25) score -= 15;
  else if (pixelDriftRatio > 0.1) score -= 8;
  if (driftRatio > 0.15 && driftRatio <= 0.3) score -= 10;
  if (layoutDriftRatio > 0.2) score -= 12;
  if (method === 'pdf-overlay' || method === 'docx-fallback-overlay') score -= 8;
  score = clampScore(score);

  let level: ConfidenceLevel;
  if (
    pageCountDelta > 1 ||
    driftRatio > 0.3 ||
    layoutDriftRatio > 0.35 ||
    pixelDriftRatio > 0.35 ||
    (unchangedPagesDrifted >= 3 && driftRatio > 0.15) ||
    (layoutDriftPages >= 3 && layoutDriftRatio > 0.2) ||
    (pixelDriftPages >= 3 && pixelDriftRatio > 0.2)
  ) {
    level = 'red';
  } else if (
    pageCountDelta === 1 ||
    unchangedPagesDrifted > 0 ||
    layoutDriftPages > 0 ||
    pixelDriftPages > 0 ||
    method === 'pdf-overlay' ||
    method === 'docx-fallback-overlay'
  ) {
    level = score >= 80 && unchangedPagesDrifted === 0 && pageCountDelta === 0 ? 'green' : 'yellow';
  } else {
    level = score >= 50 ? 'green' : 'yellow';
  }

  if (unchangedPagesDrifted === 0 && pageCountDelta === 0 && level !== 'red') {
    level = score >= 75 ? 'green' : 'yellow';
  }

  let summary: string;
  if (level === 'green') {
    summary = 'Вёрстка сохранена: число страниц и текст на неизменённых страницах совпадают.';
  } else if (level === 'yellow') {
    if (pageCountDelta === 1) {
      summary = 'Число страниц изменилось на 1 — проверьте результат визуально.';
    } else if (pixelDriftPages > 0) {
      summary = `На ${pixelDriftPages} страницах визуально заметны отличия от исходника (pixel-diff).`;
    } else if (layoutDriftPages > 0) {
      summary = `На ${layoutDriftPages} страницах смещён текстовый слой (bbox).`;
    } else if (unchangedPagesDrifted > 0) {
      summary = `На ${unchangedPagesDrifted} неизменённых страницах текст отличается от исходника.`;
    } else {
      summary = 'Режим наложения на PDF — рекомендуется визуальная проверка.';
    }
  } else {
    if (pageCountDelta > 1) {
      summary = `Число страниц изменилось (${sourcePageCount} → ${targetPageCount}). Загрузите исходный DOCX для точных правок.`;
    } else {
      summary = `Значительные расхождения на неизменённых страницах (${unchangedPagesDrifted}). Проверьте вёрстку или загрузите DOCX.`;
    }
  }

  return {
    level,
    score,
    summary,
    sourcePageCount,
    targetPageCount,
    pageCountDelta,
    editedPages: [...editedSet].sort((a, b) => a - b),
    unchangedPagesChecked,
    unchangedPagesDrifted,
    layoutPagesChecked,
    layoutDriftPages,
    pixelPagesChecked,
    pixelDriftPages,
    pixelDriftRatio,
    visualDriftPages,
    method,
  };
}
