import { apiBaseUrl } from '@folio-mind/store';

export async function loadDocumentPdfUrl(
  documentId: string,
  versionId: string,
  token: string | null,
): Promise<string> {
  const res = await fetch(
    `${apiBaseUrl}/documents/${documentId}/versions/${versionId}/file`,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
  );

  if (!res.ok) {
    throw new Error('Не удалось загрузить PDF для просмотра');
  }

  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
