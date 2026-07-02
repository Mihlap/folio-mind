import { isDocxBuffer } from '@folio-mind/pdf-contracts';

const DEFAULT_TIMEOUT_MS = 600_000;

export function getPdfToDocxUrl(): string {
  return process.env.PDF_TO_DOCX_URL ?? process.env.JODCONVERTER_URL ?? 'http://127.0.0.1:8080';
}

export function getPdfToDocxTimeoutMs(): number {
  const raw = process.env.PDF_TO_DOCX_TIMEOUT_MS;
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 30_000 ? n : DEFAULT_TIMEOUT_MS;
}

export function isPdfToDocxConfigured(url?: string): boolean {
  return Boolean(url ?? getPdfToDocxUrl());
}

function formatPdfToDocxError(err: unknown, pdfBytes: number): string {
  const sizeMb = (pdfBytes / (1024 * 1024)).toFixed(1);
  const hint =
    'Проверьте контейнер pdf2docx: docker compose up pdf2docx -d --build. ' +
    'Для PDF >15 МБ нужен mem_limit ≥2g (см. docker-compose.yml).';

  if (err instanceof Error) {
    const cause = err.cause;
    const code =
      typeof cause === 'object' && cause && 'code' in cause
        ? String((cause as { code?: string }).code)
        : '';
    if (code === 'UND_ERR_SOCKET' || /other side closed|ECONNRESET/i.test(err.message)) {
      return (
        `PDF→DOCX: соединение оборвано при конвертации (${sizeMb} МБ). ` +
        `Вероятно нехватка памяти в контейнере pdf2docx или таймаут. ${hint}`
      );
    }
    if (err.name === 'TimeoutError' || /aborted|timeout/i.test(err.message)) {
      return `PDF→DOCX: таймаут конвертации (${sizeMb} МБ). ${hint}`;
    }
  }

  return `PDF→DOCX failed: ${err instanceof Error ? err.message : String(err)}. ${hint}`;
}

export async function convertPdfToDocx(pdfBuffer: Buffer): Promise<Buffer> {
  const baseUrl = getPdfToDocxUrl().replace(/\/$/, '');
  const url = `${baseUrl}/convert/pdf-to-docx`;
  const formData = new FormData();
  formData.append('file', new Blob([pdfBuffer], { type: 'application/pdf' }), 'document.pdf');

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(getPdfToDocxTimeoutMs()),
    });
  } catch (err) {
    throw new Error(formatPdfToDocxError(err, pdfBuffer.length));
  }

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
