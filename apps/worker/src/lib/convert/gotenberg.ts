export function getGotenbergUrl(): string {
  return process.env.GOTENBERG_URL ?? 'http://127.0.0.1:3003';
}
export function isGotenbergConfigured(gotenbergUrl?: string): boolean {
  return Boolean(gotenbergUrl ?? process.env.GOTENBERG_URL);
}
async function convertViaGotenberg(buffer: Buffer, filename: string): Promise<Buffer> {
  const url = `${getGotenbergUrl()}/forms/libreoffice/convert`;
  const formData = new FormData();
  formData.append('files', new Blob([buffer]), filename);
  const res = await fetch(url, { method: 'POST', body: formData });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Gotenberg conversion failed (${res.status}): ${text.slice(0, 500)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}
export function convertDocxToPdf(docxBuffer: Buffer): Promise<Buffer> {
  return convertViaGotenberg(docxBuffer, 'document.docx');
}
