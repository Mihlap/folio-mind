import { isDocxBuffer } from '@folio-mind/pdf-contracts';
export function getPdfToDocxUrl(): string {
  return process.env.PDF_TO_DOCX_URL ?? process.env.JODCONVERTER_URL ?? 'http://127.0.0.1:8080';
}
export function isPdfToDocxConfigured(url?: string): boolean {
  return Boolean(url ?? getPdfToDocxUrl());
}
export async function convertPdfToDocx(pdfBuffer: Buffer): Promise<Buffer> {
  const baseUrl = getPdfToDocxUrl().replace(/\/$/, '');
  const url = `${baseUrl}/convert/pdf-to-docx`;
  const formData = new FormData();
  formData.append('file', new Blob([pdfBuffer], { type: 'application/pdf' }), 'document.pdf');
  const res = await fetch(url, { method: 'POST', body: formData });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `PDF→DOCX failed (${res.status}): ${text.slice(0, 500)}. ` +
        'Запустите: docker compose up pdf2docx (порт :8080).',
    );
  }
  const docxBuffer = Buffer.from(await res.arrayBuffer());
  if (!isDocxBuffer(docxBuffer)) {
    throw new Error('Сервис PDF→DOCX вернул не DOCX. Проверьте контейнер pdf2docx.');
  }
  return docxBuffer;
}
