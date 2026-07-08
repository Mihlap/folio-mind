import { PDFDocument } from 'pdf-lib';
import type { OptimizePreset } from '@folio-mind/pdf-contracts';
import {
  getOptimizeToolAvailability,
  optimizeEarlyExitTargetBytes,
  tryGhostscriptOptimize,
  tryQpdfOptimize,
  type ExternalOptimizeMethod,
} from './optimize-external.js';

export type OptimizePdfMethod = 'copy' | 'pack' | ExternalOptimizeMethod;

export type OptimizeProgressReporter = (
  update: { label: string; step?: number; total?: number },
) => void | Promise<void>;

export type OptimizePdfResult = {
  buffer: Buffer;
  pageCount: number;
  sourceBytes: number;
  outputBytes: number;
  preset: OptimizePreset;
  method: OptimizePdfMethod;
  engineDetail?: string;
  toolsAvailable: { qpdf: boolean; ghostscript: boolean };
};

async function packWithPdfLib(sourceBuffer: Buffer): Promise<Buffer> {
  const sourcePdf = await PDFDocument.load(sourceBuffer, { ignoreEncryption: true });
  return Buffer.from(
    await sourcePdf.save({
      useObjectStreams: true,
      addDefaultPage: false,
    }),
  );
}

function smallestCandidate(
  candidates: Array<{ buffer: Buffer; method: OptimizePdfMethod; engineDetail?: string }>,
  sourceBytes: number,
) {
  return candidates
    .filter((item) => item.buffer.length < sourceBytes)
    .sort((a, b) => a.buffer.length - b.buffer.length)[0];
}

function isGoodEnough(size: number, targetBytes: number | null): boolean {
  return targetBytes !== null && size <= targetBytes;
}

export async function optimizePdfBuffer(
  sourceBuffer: Buffer,
  preset: OptimizePreset,
  onProgress?: OptimizeProgressReporter,
): Promise<OptimizePdfResult> {
  const sourceBytes = sourceBuffer.length;
  const sourcePdf = await PDFDocument.load(sourceBuffer, { ignoreEncryption: true });
  const pageCount = sourcePdf.getPageCount();
  if (pageCount === 0) {
    throw new Error('PDF не содержит страниц');
  }

  const base = {
    pageCount,
    sourceBytes,
    preset,
    toolsAvailable: await getOptimizeToolAvailability(),
  };

  if (preset === 'none') {
    return {
      ...base,
      buffer: sourceBuffer,
      outputBytes: sourceBytes,
      method: 'copy',
    };
  }

  const targetBytes = optimizeEarlyExitTargetBytes(sourceBytes, preset);
  const candidates: Array<{
    buffer: Buffer;
    method: OptimizePdfMethod;
    engineDetail?: string;
  }> = [];

  await onProgress?.({ label: 'Уплотняем PDF' });
  const qpdfBuffer = await tryQpdfOptimize(sourceBuffer, preset);
  if (qpdfBuffer) {
    candidates.push({ buffer: qpdfBuffer, method: 'qpdf' });
  }

  if (preset === 'email' || preset === 'archive') {
    const gsBuffer = await tryGhostscriptOptimize(sourceBuffer, preset, {
      earlyExitBelowBytes: targetBytes,
      onProfileDone: async (step, total) => {
        await onProgress?.({ label: 'Сжимаем картинки', step, total });
      },
    });
    if (gsBuffer) {
      candidates.push({
        buffer: gsBuffer.buffer,
        method: 'ghostscript',
        engineDetail: gsBuffer.profile,
      });
    }

    const bestSoFar = smallestCandidate(candidates, sourceBytes);
    const shouldRefineQpdf =
      qpdfBuffer &&
      (!bestSoFar || qpdfBuffer.length < bestSoFar.buffer.length) &&
      !isGoodEnough(bestSoFar?.buffer.length ?? sourceBytes, targetBytes);

    if (shouldRefineQpdf) {
      await onProgress?.({ label: 'Дожимаем картинки', step: 1, total: 1 });
      const gsOnQpdf = await tryGhostscriptOptimize(qpdfBuffer, preset, {
        earlyExitBelowBytes: targetBytes,
        maxProfiles: 1,
      });
      if (gsOnQpdf) {
        candidates.push({
          buffer: gsOnQpdf.buffer,
          method: 'qpdf+ghostscript',
          engineDetail: gsOnQpdf.profile,
        });
      }
    }
  }

  const bestBeforePack = smallestCandidate(candidates, sourceBytes);
  if (!isGoodEnough(bestBeforePack?.buffer.length ?? sourceBytes, targetBytes)) {
    try {
      await onProgress?.({ label: 'Финальная упаковка' });
      const packed = await packWithPdfLib(sourceBuffer);
      candidates.push({ buffer: packed, method: 'pack' });
    } catch {
      // Packing is an optional last attempt; keep earlier candidates.
    }
  }

  const smaller = smallestCandidate(candidates, sourceBytes);

  if (!smaller) {
    return {
      ...base,
      buffer: sourceBuffer,
      outputBytes: sourceBytes,
      method: 'copy',
    };
  }

  return {
    ...base,
    buffer: smaller.buffer,
    outputBytes: smaller.buffer.length,
    method: smaller.method,
    engineDetail: smaller.engineDetail,
  };
}
