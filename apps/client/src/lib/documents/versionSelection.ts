export type VersionSelectionFields = {
  status: string;
  size?: string | number | bigint | null;
};

export function isDocumentVersionSelectable(version: VersionSelectionFields): boolean {
  if (version.status === 'pending_upload') return false;
  if (version.status === 'processing' && Number(version.size ?? 0) <= 0) return false;
  return true;
}

export const TITLE_VERSION_PREPARING =
  'Версия ещё готовится — откроется, когда обработка завершится';
