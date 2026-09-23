import type { PageText } from '@folio-mind/pdf-contracts';

export type QuoteVerification = {
  matched: boolean;
  verbatim: string;
  confidence: number;

  page?: number;
};

const MAX_FUZZY_LENGTH = 200;
const MIN_SIMILARITY = 0.82;

export function collapseWhitespace(text: string): string {
  return text.normalize('NFC').replace(/\s+/g, ' ').trim();
}

export function normalizeForMatch(text: string): string {
  return collapseWhitespace(text)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014\u2015]/g, '-');
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array<number>(n + 1).fill(0);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    const curr = new Array<number>(n + 1).fill(0);
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[n];
}

function similarity(a: string, b: string): number {
  const sum = a.length + b.length;
  if (sum === 0) return 1;
  return 1 - levenshtein(a, b) / sum;
}

function alnumKey(text: string): { key: string; charIndexes: number[] } {
  const charIndexes: number[] = [];
  const parts: string[] = [];
  for (let i = 0; i < text.length; i++) {
    if (/[\p{L}\p{N}]/u.test(text[i])) {
      parts.push(text[i]);
      charIndexes.push(i);
    }
  }
  return { key: parts.join(''), charIndexes };
}

export function findVerbatimQuote(pageText: string, candidate: string): QuoteVerification {
  const source = collapseWhitespace(pageText);
  const cand = normalizeForMatch(candidate);
  if (!source || !cand) {
    return { matched: false, verbatim: candidate, confidence: 0 };
  }

  const exactIdx = source.indexOf(cand);
  if (exactIdx >= 0) {
    const verbatim = collapseWhitespace(source.slice(exactIdx, exactIdx + cand.length));
    return { matched: true, verbatim, confidence: 1 };
  }

  if (cand.length > MAX_FUZZY_LENGTH) {
    return { matched: false, verbatim: candidate, confidence: 0 };
  }

  const base = alnumKey(source);
  const target = alnumKey(cand);
  const tLen = target.key.length;
  if (tLen === 0) {
    return { matched: false, verbatim: candidate, confidence: 0 };
  }

  let best: { confidence: number; slice: string } | null = null;
  for (let start = 0; start + tLen <= base.key.length; start++) {
    if (base.key.slice(start, start + tLen) !== target.key) continue;
    const beginChar = base.charIndexes[start];
    const endChar = base.charIndexes[start + tLen - 1];
    const slice = collapseWhitespace(source.slice(beginChar, endChar + 1));
    const conf = similarity(cand, slice);
    if (!best || conf > best.confidence) {
      best = { confidence: conf, slice };
    }
  }

  if (best && best.confidence >= MIN_SIMILARITY) {
    return { matched: true, verbatim: best.slice, confidence: best.confidence };
  }
  return { matched: false, verbatim: candidate, confidence: best?.confidence ?? 0 };
}

export function findBestVerbatimQuote(pages: PageText[], candidate: string): QuoteVerification {
  let best: QuoteVerification = { matched: false, verbatim: candidate, confidence: 0 };
  for (const page of pages) {
    if (!page.text.trim()) continue;
    const res = findVerbatimQuote(page.text, candidate);
    if (res.matched && res.confidence > best.confidence) {
      best = { ...res, page: page.page };
    }
  }
  return best;
}
