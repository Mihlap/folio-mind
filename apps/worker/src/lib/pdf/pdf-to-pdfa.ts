import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { withPdfTempFiles } from './pdf-temp-files.js';

const execFileAsync = promisify(execFile);

function discoverBinaryOnWindows(dirPrefix: string, binName: string): string | null {
  const programFiles = process.env['ProgramFiles'] ?? 'C:\\Program Files';
  try {
    for (const entry of readdirSync(programFiles)) {
      if (!entry.toLowerCase().startsWith(dirPrefix.toLowerCase())) continue;
      const candidate = join(programFiles, entry, 'bin', binName);
      if (existsSync(candidate)) return candidate;
    }
    const gsRoot = join(programFiles, 'gs');
    if (existsSync(gsRoot)) {
      for (const entry of readdirSync(gsRoot)) {
        const candidate = join(gsRoot, entry, 'bin', binName);
        if (existsSync(candidate)) return candidate;
      }
    }
  } catch {
  }
  return null;
}

function resolveGhostscriptBin(): string {
  if (process.env.GHOSTSCRIPT_BIN?.trim()) return process.env.GHOSTSCRIPT_BIN.trim();
  if (process.platform === 'win32') {
    return discoverBinaryOnWindows('gs', 'gswin64c.exe') ?? 'gswin64c';
  }
  return 'gs';
}

export async function tryConvertPdfA(sourceBuffer: Buffer): Promise<Buffer | null> {
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
          '-dPDFA=2',
          '-dPDFACompatibilityPolicy=1',
          '-sColorConversionStrategy=RGB',
          '-sProcessColorModel=DeviceRGB',
          `-sOutputFile=${outputPath}`,
          inputPath,
        ],
        { timeout: 180_000, maxBuffer: 64 * 1024 * 1024 },
      );
      const { readFile } = await import('node:fs/promises');
      const out = await readFile(outputPath);
      return out.length > 0 ? out : null;
    } catch {
      return null;
    }
  });
}
