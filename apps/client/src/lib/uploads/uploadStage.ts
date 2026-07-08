export function getUploadStage(progress: number | null): string {
  if (progress === null || progress <= 0) return 'Подготовка…';
  if (progress < 100) return 'Загрузка файла в хранилище…';
  return 'Подтверждение загрузки…';
}

export function uploadFileLabel(pdfName: string, docxName?: string): string {
  return docxName ? `${pdfName} + ${docxName}` : pdfName;
}
