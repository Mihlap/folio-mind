import { PDFDocument } from 'pdf-lib';
import {
  GigaChatProvider,
  type AIProviderName,
} from '@folio-mind/ai-providers';
import { extractJsonFromLlm } from '@folio-mind/ai-contracts';
import {
  VISION_OCR_MAX_PAGES,
  buildExtractedTextPayload,
  extractedTextKey,
  normalizePageTexts,
  type PageText,
} from '@folio-mind/pdf-contracts';
import type { WorkerJobPayload } from '../../lib/config/job-types.js';
import type { WorkerEnv } from '../../lib/config/env.js';
import { createLLMFromWorkerEnv } from '../../lib/ai/llm.js';
import { getPrisma } from '../../lib/infra/prisma.js';
import { countPdfPages } from '../../lib/pdf/pdf-previews.js';
import { getObjectBuffer, isWorkerS3Configured, putObjectBuffer } from '../../lib/storage/s3.js';
import { indexDocumentVersionChunks } from '../rag/document-index.js';

type VisionOcrPayload = WorkerJobPayload & {
  jobId?: string;
  documentId?: string;
  versionId?: string;
  tenantId?: string;
  s3Key?: string;
  pageCount?: number;
  provider?: AIProviderName;
  force?: boolean;
};

const OCR_SYSTEM = `Ты извлекаешь текст из PDF-скана (изображения страниц).
Верни ТОЛЬКО валидный JSON без markdown-ограждений:
{"pages":[{"page":1,"text":"..."},{"page":2,"text":"..."}]}
Правила:
- page — номер страницы с 1
- text — распознанный текст страницы на языке документа
- не выдумывай отсутствующий текст; если страница пустая — text: ""
- сохрани порядок страниц`;

const OCR_FORCE_BATCH_PAGES = 10;
const OCR_FORCE_MAX_PAGES = 100;

export function buildOcrBatches(
  totalPages: number,
  batchSize: number,
): Array<[number, number]> {
  const total = Math.max(0, Math.floor(totalPages));
  const size = Math.max(1, Math.floor(batchSize));
  const batches: Array<[number, number]> = [];
  for (let from = 1; from <= total; from += size) {
    batches.push([from, Math.min(from + size - 1, total)]);
  }
  return batches;
}

async function slicePdfFirstPages(pdfBuffer: Buffer, maxPages: number): Promise<Buffer> {
  const source = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  const total = source.getPageCount();
  if (total <= maxPages) return pdfBuffer;
  const target = await PDFDocument.create();
  const indices = Array.from({ length: maxPages }, (_, i) => i);
  const copied = await target.copyPages(source, indices);
  for (const page of copied) target.addPage(page);
  return Buffer.from(await target.save());
}

async function slicePdfPageRange(
  pdfBuffer: Buffer,
  fromPage: number,
  toPage: number,
): Promise<Buffer> {
  const total = await countPdfPages(pdfBuffer);
  const start = Math.max(1, fromPage);
  const end = Math.min(total, toPage);
  if (end <= start) return pdfBuffer;
  if (start === 1 && end >= total) return pdfBuffer;
  const source = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  const target = await PDFDocument.create();
  const indices = Array.from({ length: end - start + 1 }, (_, i) => start - 1 + i);
  const copied = await target.copyPages(source, indices);
  for (const page of copied) target.addPage(page);
  return Buffer.from(await target.save());
}

function parseOcrPages(raw: string, pageOffset = 0): PageText[] {
  try {
    const parsed = extractJsonFromLlm(raw) as {
      pages?: Array<{ page?: number; text?: string }>;
    };
    const pages: PageText[] = [];
    if (Array.isArray(parsed?.pages)) {
      for (const item of parsed.pages) {
        const page =
          (typeof item.page === 'number' ? item.page : pages.length + 1) + pageOffset;
        const text = typeof item.text === 'string' ? item.text.trim() : '';
        if (text) pages.push({ page, text });
      }
    }
    if (pages.length > 0) return normalizePageTexts(pages);
  } catch {
    // fall through
  }

  const plain = raw.replace(/```json|```/gi, '').trim();
  if (plain && !plain.startsWith('{') && plain.length > 40) {
    return [{ page: 1 + pageOffset, text: plain.slice(0, 100_000) }];
  }
  return [];
}

export async function processVisionOcrJob(env: WorkerEnv, data: VisionOcrPayload): Promise<void> {
  const prisma = getPrisma();
  const jobId = data.jobId;
  const documentId = data.documentId;
  const versionId = data.versionId;
  const tenantId = data.tenantId;
  const s3Key = data.s3Key;
  if (!jobId || !documentId || !versionId || !tenantId || !s3Key) {
    throw new Error('vision-ocr job: missing required fields');
  }

  const dbJob = await prisma.job.findUnique({ where: { id: jobId } });
  if (!dbJob) throw new Error(`Job not found: ${jobId}`);
  const jobPayload = (dbJob.payload ?? {}) as Record<string, unknown>;
  const provider =
    (jobPayload.provider as AIProviderName | undefined) ?? data.provider ?? env.AI_PROVIDER;
  const pageCount =
    (typeof jobPayload.pageCount === 'number' ? jobPayload.pageCount : data.pageCount) ?? 0;

  await prisma.job.update({ where: { id: jobId }, data: { status: 'processing' } });
  await prisma.documentVersion.update({
    where: { id: versionId },
    data: { visionOcrStatus: 'processing' },
  });

  const collected: PageText[] = [];
  let lastModel: string | undefined;
  let pagesDone = 0;
  let pagesTotal = 0;

  try {
    if (!isWorkerS3Configured()) {
      throw new Error('S3 не настроен в worker');
    }
    const llm = createLLMFromWorkerEnv(env, provider);
    if (!(provider === 'gigachat' && llm instanceof GigaChatProvider)) {
      throw new Error(
        'Распознавание сканов доступно через GigaChat. Выберите GigaChat или загрузите PDF с текстовым слоем.',
      );
    }

    const pdfBuffer = await getObjectBuffer(s3Key);
    const force = jobPayload.force === true || data.force === true;
    if (force) {
      const actualPageCount = await countPdfPages(pdfBuffer);
      pagesTotal = Math.min(
        actualPageCount > 0 ? actualPageCount : pageCount || OCR_FORCE_BATCH_PAGES,
        OCR_FORCE_MAX_PAGES,
      );
      for (const [from, to] of buildOcrBatches(pagesTotal, OCR_FORCE_BATCH_PAGES)) {
        const batchPdf = await slicePdfPageRange(pdfBuffer, from, to);
        const result = await llm.completeWithPdf({
          system: OCR_SYSTEM,
          prompt: `Извлеки текст этого PDF-скана. В приложении страницы пронумерованы с 1 и соответствуют страницам ${from}–${to} исходного документа. Верни JSON {"pages":[...]} с номерами страниц приложения.`,
          pdf: batchPdf,
          filename: `${documentId}-${from}-${to}.pdf`,
          maxTokens: 8000,
        });
        lastModel = result.model;
        const batchPages = parseOcrPages(result.text, from - 1);
        collected.push(...batchPages);
        pagesDone = to;        await prisma.job.update({
          where: { id: jobId },
          data: {
            payload: { ...jobPayload, documentId, versionId, provider, ocrPagesDone: pagesDone, ocrPagesTotal: pagesTotal },
          },
        });
      }
    } else {
      const maxPages = Math.min(
        pageCount > 0 ? pageCount : VISION_OCR_MAX_PAGES,
        VISION_OCR_MAX_PAGES,
      );
      pagesTotal = maxPages;
      const ocrPdf = await slicePdfFirstPages(pdfBuffer, maxPages);
      const result = await llm.completeWithPdf({
        system: OCR_SYSTEM,
        prompt: `Извлеки текст со страниц 1–${maxPages} этого PDF-скана. Верни JSON {"pages":[...]}.`,
        pdf: ocrPdf,
        filename: `${documentId}.pdf`,
        maxTokens: 4000,
      });
      lastModel = result.model;
      collected.push(...parseOcrPages(result.text));
      pagesDone = maxPages;
    }

    const pages = normalizePageTexts(collected);
    const text = pages
      .map((p) => p.text)
      .join('\n\n')
      .trim();
    if (!text) {
      throw new Error('Не удалось распознать текст на скане');
    }

    const payload = buildExtractedTextPayload({
      text,
      pages,
      source: 'vision-ocr',
    });
    await putObjectBuffer({
      key: extractedTextKey(documentId, versionId),
      body: Buffer.from(JSON.stringify(payload), 'utf8'),
      contentType: 'application/json',
    });

    await prisma.documentVersion.update({
      where: { id: versionId },
      data: {
        textSource: 'vision-ocr',
        visionOcrStatus: 'ready',
      },
    });

    try {
      await indexDocumentVersionChunks({
        env,
        documentId,
        versionId,
        tenantId,
        pages,
        provider,
      });
    } catch (indexErr) {
      console.warn('[vision-ocr] document-index failed', indexErr);
    }

    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'completed',
        payload: {
          ...jobPayload,
          documentId,
          versionId,
          provider,
          model: lastModel,
          pageCount: pages.length,
          textChars: text.length,
          textSource: 'vision-ocr',
          ocrPagesDone: pagesDone,
          ocrPagesTotal: pagesTotal,
        },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'vision-ocr failed';
    const partialPages = normalizePageTexts(collected);
    const partialText = partialPages
      .map((p) => p.text)
      .join('\n\n')
      .trim();
    if (partialText) {
      await putObjectBuffer({
        key: extractedTextKey(documentId, versionId),
        body: Buffer.from(
          JSON.stringify(
            buildExtractedTextPayload({ text: partialText, pages: partialPages, source: 'vision-ocr' }),
          ),
          'utf8',
        ),
        contentType: 'application/json',
      });
      await prisma.documentVersion.update({
        where: { id: versionId },
        data: { textSource: 'vision-ocr' },
      });
    }
    await prisma.documentVersion.update({
      where: { id: versionId },
      data: { visionOcrStatus: 'failed' },
    });
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'failed',
        payload: {
          ...jobPayload,
          documentId,
          versionId,
          error: message,
          ocrPagesDone: pagesDone,
          ocrPagesTotal: pagesTotal,
          partialTextSaved: Boolean(partialText),
        },
      },
    });
    throw err;
  }
}
