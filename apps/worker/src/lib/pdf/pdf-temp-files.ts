import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function withPdfTempFiles<T>(
  input: Buffer,
  fn: (paths: { inputPath: string; outputPath: string; dir: string }) => Promise<T>,
): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'folio-pdf-'));
  const inputPath = join(dir, 'in.pdf');
  const outputPath = join(dir, 'out.pdf');
  try {
    await writeFile(inputPath, input);
    return await fn({ inputPath, outputPath, dir });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function readOutputIfExists(outputPath: string): Promise<Buffer | null> {
  try {
    const buffer = await readFile(outputPath);
    return buffer.length > 0 ? buffer : null;
  } catch {
    return null;
  }
}
