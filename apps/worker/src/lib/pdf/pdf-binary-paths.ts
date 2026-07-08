import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../../../');

function discoverInDirectory(rootDir: string, binName: string): string | null {
  if (!existsSync(rootDir)) return null;
  try {
    for (const entry of readdirSync(rootDir)) {
      const candidate = join(rootDir, entry, 'bin', binName);
      if (existsSync(candidate)) return candidate;
    }
  } catch {
  }
  return null;
}

function discoverBinaryOnWindows(dirPrefix: string, binName: string): string | null {
  const programDirs = [
    process.env['ProgramFiles'],
    process.env['ProgramFiles(x86)'],
    'C:\\Program Files',
    'C:\\Program Files (x86)',
  ].filter((dir, index, list): dir is string => Boolean(dir) && list.indexOf(dir) === index);

  for (const programFiles of programDirs) {
    try {
      for (const entry of readdirSync(programFiles)) {
        if (!entry.toLowerCase().startsWith(dirPrefix.toLowerCase())) continue;
        const candidate = join(programFiles, entry, 'bin', binName);
        if (existsSync(candidate)) return candidate;
      }
      const gsRoot = join(programFiles, 'gs');
      const nested = discoverInDirectory(gsRoot, binName);
      if (nested) return nested;
    } catch {
    }
  }
  return null;
}

function discoverVendoredBinary(toolDir: string, binName: string): string | null {
  return discoverInDirectory(join(repoRoot, 'tools', toolDir), binName);
}

export function resolveQpdfBin(): string {
  if (process.env.QPDF_BIN?.trim()) return process.env.QPDF_BIN.trim();
  if (process.platform === 'win32') {
    return (
      discoverVendoredBinary('qpdf', 'qpdf.exe') ??
      discoverBinaryOnWindows('qpdf', 'qpdf.exe') ??
      'qpdf'
    );
  }
  return 'qpdf';
}

export function resolveGhostscriptBin(): string {
  if (process.env.GHOSTSCRIPT_BIN?.trim()) return process.env.GHOSTSCRIPT_BIN.trim();
  if (process.platform === 'win32') {
    return (
      discoverVendoredBinary('ghostscript', 'gswin64c.exe') ??
      discoverBinaryOnWindows('gs', 'gswin64c.exe') ??
      'gswin64c'
    );
  }
  return 'gs';
}
