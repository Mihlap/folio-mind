import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { analyzePdfIntegrity, type PdfIntegrityResult } from '@folio-mind/pdf-contracts';
const execFileAsync = promisify(execFile);
async function isQpdfAvailable(qpdfBin: string, pdfBuffer: Buffer): Promise<boolean> {
  const dir = await mkdtemp(join(tmpdir(), 'folio-integrity-'));
  const filePath = join(dir, 'input.pdf');
  try {
    await writeFile(filePath, pdfBuffer);
    await execFileAsync(qpdfBin, ['--json', filePath], {
      timeout: 30000,
      maxBuffer: 8 * 1024 * 1024,
    });
    return true;
  } catch {
    return false;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
export async function analyzePdfIntegrityFromBuffer(
  pdfBuffer: Buffer,
  qpdfBin = process.env.QPDF_BIN ?? 'qpdf',
): Promise<PdfIntegrityResult> {
  const usedQpdf = await isQpdfAvailable(qpdfBin, pdfBuffer);
  const result = analyzePdfIntegrity(pdfBuffer, usedQpdf ? 'qpdf' : 'builtin');
  return result;
}
