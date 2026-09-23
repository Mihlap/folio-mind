export type DocxLayoutRisk = 'images' | 'deck' | 'mixed' | null;
export type DocxLayoutRiskStats = {
  textChars: number;
  drawings: number;
  type3Runs: number;
  totalRuns: number;
};
export function classifyDocxLayoutRisk(stats: DocxLayoutRiskStats): DocxLayoutRisk {
  const { textChars, drawings, type3Runs, totalRuns } = stats;
  const type3Ratio = totalRuns > 0 ? type3Runs / totalRuns : 0;
  const imagesRisk =
    textChars === 0 ||
    (drawings >= 3 && textChars < drawings * 60) ||
    (drawings >= 6 && textChars < 1800);
  const deckRisk = type3Ratio >= 0.5 && textChars >= 100;
  if (imagesRisk && deckRisk) return 'mixed';
  if (imagesRisk) return 'images';
  if (deckRisk) return 'deck';
  return null;
}