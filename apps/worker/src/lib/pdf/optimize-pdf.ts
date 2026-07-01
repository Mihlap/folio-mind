import { PDFDocument } from 'pdf-lib';
import type { OptimizePreset } from '@folio-mind/pdf-contracts';
import {
  getOptimizeToolAvailability,
  tryGhostscriptOptimize,
  tryQpdfOptimize,
  type ExternalOptimizeMethod,
} from './optimize-external.js';

export type OptimizePdfMethod = 'copy' | 'pack' | ExternalOptimizeMethod;

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

export async function optimizePdfBuffer(
  sourceBuffer: Buffer,
  preset: OptimizePreset,
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

  const candidates: Array<{
    buffer: Buffer;
    method: OptimizePdfMethod;
    engineDetail?: string;
  }> = [];

  const qpdfBuffer = await tryQpdfOptimize(sourceBuffer, preset);
  if (qpdfBuffer) {
    candidates.push({ buffer: qpdfBuffer, method: 'qpdf' });
  }

  if (preset === 'email' || preset === 'archive') {
    const gsBuffer = await tryGhostscriptOptimize(sourceBuffer, preset);
    if (gsBuffer) {
      candidates.push({
        buffer: gsBuffer.buffer,
        method: 'ghostscript',
        engineDetail: gsBuffer.profile,
      });
    }

    if (qpdfBuffer) {
      const gsOnQpdf = await tryGhostscriptOptimize(qpdfBuffer, preset);
      if (gsOnQpdf) {
        candidates.push({
          buffer: gsOnQpdf.buffer,
          method: 'qpdf+ghostscript',
          engineDetail: gsOnQpdf.profile,
        });
      }
    }
  }

  try {
    const packed = await packWithPdfLib(sourceBuffer);
    candidates.push({ buffer: packed, method: 'pack' });
  } catch {
  }

  const smaller = candidates
    .filter((item) => item.buffer.length < sourceBytes)
    .sort((a, b) => a.buffer.length - b.buffer.length)[0];

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
