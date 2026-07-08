const STATUS_LABEL: Record<string, string> = {
  pending_upload: 'не загружен',
  processing: 'сборка',
  ready: 'готов',
  failed: 'ошибка',
};

export function formatVersionStatusLabel(
  status: string | undefined,
  hasPdfUrl: boolean,
  previewPageCount: number,
): string {
  if (!status) return '';
  if (status === 'processing') {
    if (hasPdfUrl || previewPageCount > 0) return 'открывается';
    return 'сборка PDF';
  }
  return STATUS_LABEL[status] ?? status;
}
