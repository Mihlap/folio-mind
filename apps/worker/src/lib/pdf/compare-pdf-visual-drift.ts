import {
  comparePagePixelDiffs,
  summarizePixelDrift,
  type RgbaPageBitmap,
} from '@folio-mind/pdf-contracts';
import { renderPdfPagesRgba } from './pdf-previews.js';

const MAX_PIXEL_PAGES = 12;

function toRgba(bitmap: {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}): RgbaPageBitmap {
  return { width: bitmap.width, height: bitmap.height, data: bitmap.data };
}

export async function comparePdfVisualDrift(params: {
  sourceBuffer: Buffer;
  targetBuffer: Buffer;
  sourcePageCount: number;
  targetPageCount: number;
  editedPages: number[];
}): Promise<ReturnType<typeof summarizePixelDrift>> {
  const editedSet = new Set(params.editedPages.filter((p) => p >= 1));
  const maxPage = Math.max(params.sourcePageCount, params.targetPageCount, 1);
  const candidatePages: number[] = [];
  for (let page = 1; page <= maxPage; page++) {
    if (editedSet.has(page)) continue;
    if (page > params.sourcePageCount || page > params.targetPageCount) continue;
    candidatePages.push(page);
  }

  if (candidatePages.length === 0) {
    return {
      pixelPagesChecked: 0,
      pixelDriftPages: 0,
      pixelDriftRatio: 0,
      visualDriftPages: [],
    };
  }

  const step =
    candidatePages.length > MAX_PIXEL_PAGES
      ? Math.ceil(candidatePages.length / MAX_PIXEL_PAGES)
      : 1;
  const pagesToCheck = candidatePages.filter((_, index) => index % step === 0).slice(0, MAX_PIXEL_PAGES);

  const [sourceBitmaps, targetBitmaps] = await Promise.all([
    renderPdfPagesRgba(params.sourceBuffer, pagesToCheck),
    renderPdfPagesRgba(params.targetBuffer, pagesToCheck),
  ]);
  const sourceMap = new Map(sourceBitmaps.map((b) => [b.page, b]));
  const targetMap = new Map(targetBitmaps.map((b) => [b.page, b]));

  const pairs = pagesToCheck
    .map((page) => {
      const source = sourceMap.get(page);
      const target = targetMap.get(page);
      if (!source || !target) return null;
      return { page, source: toRgba(source), target: toRgba(target) };
    })
    .filter((pair): pair is NonNullable<typeof pair> => pair !== null);

  const pageResults = comparePagePixelDiffs(pairs);
  return summarizePixelDrift(pageResults);
}
