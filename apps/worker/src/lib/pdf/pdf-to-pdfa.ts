import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readOutputIfExists, withPdfTempFiles } from './pdf-temp-files.js';
import { isGhostscriptAvailable, resolveGhostscriptBin } from './optimize-external.js';

const execFileAsync = promisify(execFile);

export async function tryConvertPdfA(sourceBuffer: Buffer): Promise<Buffer | null> {
  if (!(await isGhostscriptAvailable())) {
    console.warn('[pdf-a] Ghostscript недоступен — PDF/A пропущен. Запустите tools/install-ghostscript.ps1 или установите GS вручную.');
    return null;
  }

  const gsBin = resolveGhostscriptBin();
  return withPdfTempFiles(sourceBuffer, async ({ inputPath, outputPath }) => {
    try {
      await execFileAsync(
        gsBin,
        [
          '-dBATCH',
          '-dNOPAUSE',
          '-dNOOUTERSAVE',
          '-sDEVICE=pdfwrite',
          '-dCompatibilityLevel=1.7',
          '-dPDFA=2',
          '-dPDFACompatibilityPolicy=1',
          '-sColorConversionStrategy=RGB',
          '-sProcessColorModel=DeviceRGB',
          `-sOutputFile=${outputPath}`,
          inputPath,
        ],
        { timeout: 180_000, maxBuffer: 64 * 1024 * 1024 },
      );
      return readOutputIfExists(outputPath);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.warn(`[pdf-a] Конвертация не удалась (${gsBin}): ${detail}`);
      return null;
    }
  });
}
