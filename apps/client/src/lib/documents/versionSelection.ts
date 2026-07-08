export type VersionSelectionFields = {
  status: string;
  size?: string | number | bigint | null;
};

/** Версию можно открыть в просмотрщике (файл уже есть или загружается превью). */
export function isDocumentVersionSelectable(version: VersionSelectionFields): boolean {
  if (version.status === 'pending_upload') return false;
  if (version.status === 'processing' && Number(version.size ?? 0) <= 0) return false;
  return true;
}

export const TITLE_VERSION_PREPARING =
  'Версия ещё готовится — откроется, когда обработка завершится';
