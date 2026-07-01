import { execFile } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { OptimizePreset } from '@folio-mind/pdf-contracts';
import { readOutputIfExists, withPdfTempFiles } from './pdf-temp-files.js';

const execFileAsync = promisify(execFile);
const BASE_TIMEOUT_MS = 120_000;
const LARGE_FILE_BYTES = 8 * 1024 * 1024;

export type ExternalOptimizeMethod = 'ghostscript' | 'qpdf' | 'qpdf+ghostscript';

function optimizeTimeoutMs(sourceBytes: number): number {
  if (sourceBytes >= 24 * 1024 * 1024) return 300_000;
  if (sourceBytes >= LARGE_FILE_BYTES) return 180_000;
  return BASE_TIMEOUT_MS;
}

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
    // ignore
  }
  return null;
}

function resolveQpdfBin(): string {
  if (process.env.QPDF_BIN?.trim()) return process.env.QPDF_BIN.trim();
  if (process.platform === 'win32') {
    return discoverBinaryOnWindows('qpdf', 'qpdf.exe') ?? 'qpdf';
  }
  return 'qpdf';
}

function resolveGhostscriptBin(): string {
  if (process.env.GHOSTSCRIPT_BIN?.trim()) return process.env.GHOSTSCRIPT_BIN.trim();
  if (process.platform === 'win32') {
    return discoverBinaryOnWindows('gs', 'gswin64c.exe') ?? 'gswin64c';
  }
  return 'gs';
}

type GhostscriptProfile = {
  id: string;
  pdfSettings?: string;
  extraArgs?: string[];
};

function ghostscriptProfilesForPreset(preset: OptimizePreset): GhostscriptProfile[] {
  if (preset === 'email') {
    return [
      { id: 'screen', pdfSettings: '/screen' },
      { id: 'ebook', pdfSettings: '/ebook' },
      {
        id: 'custom-120dpi',
        extraArgs: [
          '-dDownsampleColorImages=true',
          '-dColorImageResolution=120',
          '-dDownsampleGrayImages=true',
          '-dGrayImageResolution=120',
          '-dDownsampleMonoImages=true',
          '-dMonoImageResolution=300',
          '-dEncodeColorImages=true',
          '-dEncodeGrayImages=true',
          '-dAutoFilterColorImages=true',
          '-dAutoFilterGrayImages=true',
          '-dColorImageFilter=/DCTEncode',
          '-dGrayImageFilter=/DCTEncode',
          '-dJPEGQ=72',
        ],
      },
    ];
  }
  if (preset === 'archive') {
    return [{ id: 'printer', pdfSettings: '/printer' }, { id: 'ebook', pdfSettings: '/ebook' }];
  }
  if (preset === 'print') {
    return [{ id: 'prepress', pdfSettings: '/prepress' }];
  }
  return [];
}

function qpdfArgsForPreset(preset: OptimizePreset): string[] | null {
  const base = ['--warning-exit-0', '--deterministic-id', '--compress-streams=y', '--object-streams=generate'];
  if (preset === 'email') {
    return [
      ...base,
      '--optimize-images',
      '--remove-unreferenced-resources=yes',
    ];
  }
  if (preset === 'archive') {
    return [...base, '--optimize-images'];
  }
  if (preset === 'print') {
    return base;
  }
  return null;
}

async function runBinary(
  bin: string,
  args: string[],
  timeoutMs = BASE_TIMEOUT_MS,
): Promise<boolean> {
  try {
    await execFileAsync(bin, args, {
      timeout: timeoutMs,
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
    });
    return true;
  } catch {
    return false;
  }
}

export async function isQpdfAvailable(): Promise<boolean> {
  return runBinary(resolveQpdfBin(), ['--version'], 10_000);
}

export async function isGhostscriptAvailable(): Promise<boolean> {
  return runBinary(resolveGhostscriptBin(), ['--version'], 10_000);
}

export async function tryQpdfOptimize(
  sourceBuffer: Buffer,
  preset: OptimizePreset,
): Promise<Buffer | null> {
  const args = qpdfArgsForPreset(preset);
  if (!args) return null;
  const bin = resolveQpdfBin();
  const timeoutMs = optimizeTimeoutMs(sourceBuffer.length);
  return withPdfTempFiles(sourceBuffer, async ({ inputPath, outputPath }) => {
    const ok = await runBinary(bin, [...args, inputPath, outputPath], timeoutMs);
    if (!ok) return null;
    return readOutputIfExists(outputPath);
  });
}

async function runGhostscriptProfile(
  sourceBuffer: Buffer,
  profile: GhostscriptProfile,
): Promise<Buffer | null> {
  const bin = resolveGhostscriptBin();
  const timeoutMs = optimizeTimeoutMs(sourceBuffer.length);
  return withPdfTempFiles(sourceBuffer, async ({ inputPath, outputPath }) => {
    const args = [
      '-sDEVICE=pdfwrite',
      '-dCompatibilityLevel=1.4',
      '-dDetectDuplicateImages=true',
      '-dCompressFonts=true',
      '-dSubsetFonts=true',
      '-dNOPAUSE',
      '-dQUIET',
      '-dBATCH',
      ...(profile.pdfSettings ? [`-dPDFSETTINGS=${profile.pdfSettings}`] : []),
      ...(profile.extraArgs ?? []),
      `-sOutputFile=${outputPath}`,
      inputPath,
    ];
    const ok = await runBinary(bin, args, timeoutMs);
    if (!ok) return null;
    return readOutputIfExists(outputPath);
  });
}

export async function tryGhostscriptOptimize(
  sourceBuffer: Buffer,
  preset: OptimizePreset,
): Promise<{ buffer: Buffer; profile: string } | null> {
  const profiles = ghostscriptProfilesForPreset(preset);
  if (profiles.length === 0) return null;

  let best: { buffer: Buffer; profile: string } | null = null;
  for (const profile of profiles) {
    const buffer = await runGhostscriptProfile(sourceBuffer, profile);
    if (!buffer) continue;
    if (!best || buffer.length < best.buffer.length) {
      best = { buffer, profile: profile.id };
    }
  }
  return best;
}

export async function getOptimizeToolAvailability(): Promise<{
  qpdf: boolean;
  ghostscript: boolean;
}> {
  const [qpdf, ghostscript] = await Promise.all([isQpdfAvailable(), isGhostscriptAvailable()]);
  return { qpdf, ghostscript };
}
