export function hasUserSourceDocx(key: string | null | undefined): boolean {
  return Boolean(key?.includes('/originals/'));
}

export type VersionDocxInfo = {
  sourceDocxKey?: string | null;
  hasAppliedDocx?: boolean;
};

export function versionHasDocxDownload(version: VersionDocxInfo): boolean {
  return hasUserSourceDocx(version.sourceDocxKey) || Boolean(version.hasAppliedDocx);
}

export function docxDownloadLabel(version: VersionDocxInfo): string {
  if (version.hasAppliedDocx) return 'DOCX правки';
  return 'DOCX';
}

export function docxDownloadTitle(version: VersionDocxInfo): string {
  if (version.hasAppliedDocx) return 'Скачать DOCX с применёнными правками';
  return 'Скачать исходный DOCX';
}

export function docxBadgeLabel(version: VersionDocxInfo): string | null {
  if (version.hasAppliedDocx) return 'DOCX правки';
  if (hasUserSourceDocx(version.sourceDocxKey)) return 'DOCX исх.';
  return null;
}

export function docxBadgeTitle(version: VersionDocxInfo): string {
  if (version.hasAppliedDocx) return 'Word-файл с уже внесёнными правками';
  return 'Исходный DOCX прикреплён при загрузке';
}
