export type RegulationsSearchHit = {
  id: string;
  sourceId: string;
  sourceTitle: string;
  chunkIndex: number;
  content: string;
};

export type RegulationsSearchDraft = {
  query: string;
  hits: RegulationsSearchHit[];
  collapsed: boolean;
};

const STORAGE_KEY = 'folio-regulations-search';

function isHit(value: unknown): value is RegulationsSearchHit {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === 'string' &&
    typeof row.sourceId === 'string' &&
    typeof row.sourceTitle === 'string' &&
    typeof row.chunkIndex === 'number' &&
    typeof row.content === 'string'
  );
}

export function loadRegulationsSearchDraft(): RegulationsSearchDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RegulationsSearchDraft>;
    if (!Array.isArray(parsed.hits) || !parsed.hits.every(isHit)) return null;
    return {
      query: typeof parsed.query === 'string' ? parsed.query : '',
      hits: parsed.hits,
      collapsed: parsed.collapsed === true,
    };
  } catch {
    return null;
  }
}

export function saveRegulationsSearchDraft(draft: RegulationsSearchDraft): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    /* ignore quota */
  }
}

export function clearRegulationsSearchDraft(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
