import { apiBaseUrl } from '@folio-mind/store';

export async function loadDocumentPdfUrl(
  documentId: string,
  versionId: string,
  token: string | null,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch(
    `${apiBaseUrl}/documents/${documentId}/versions/${versionId}/file`,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal,
    },
  );

  if (!res.ok) {
    throw new Error('Не удалось загрузить PDF для просмотра');
  }

  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
