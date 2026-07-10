export type BookletTitleFields = {
  title: string;
  subtitle: string;
  tagline: string;
};

export const EMPTY_BOOKLET_TITLE_FIELDS: BookletTitleFields = {
  title: '',
  subtitle: '',
  tagline: '',
};

function storageKey(documentId: string): string {
  return `folio-booklet-title:${documentId}`;
}

export function loadBookletTitleDraft(documentId: string): BookletTitleFields | null {
  if (typeof window === 'undefined' || !documentId) return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey(documentId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BookletTitleFields>;
    return {
      title: typeof parsed.title === 'string' ? parsed.title : '',
      subtitle: typeof parsed.subtitle === 'string' ? parsed.subtitle : '',
      tagline: typeof parsed.tagline === 'string' ? parsed.tagline : '',
    };
  } catch {
    return null;
  }
}

export function saveBookletTitleDraft(documentId: string, fields: BookletTitleFields): void {
  if (typeof window === 'undefined' || !documentId) return;
  try {
    window.sessionStorage.setItem(storageKey(documentId), JSON.stringify(fields));
  } catch {
    /* ignore quota */
  }
}

export function bookletTitleFieldsFromAi(input: {
  title?: string;
  subtitle?: string;
  tagline?: string;
}): BookletTitleFields {
  return {
    title: input.title?.trim() ?? '',
    subtitle: input.subtitle?.trim() ?? 'Буклет',
    tagline: input.tagline?.trim() ?? '',
  };
}
