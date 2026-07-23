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
};

const OCR_SYSTEM = `Ты извлекаешь текст из PDF-скана (изображения страниц).
Верни ТОЛЬКО валидный JSON без markdown-ограждений:
{"pages":[{"page":1,"text":"..."},{"page":2,"text":"..."}]}
Правила:
- page — номер страницы с 1
- text — распознанный текст страницы на языке документа
- не выдумывай отсутствующий текст; если страница пустая — text: ""
- сохрани порядок страниц`;

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

function parseOcrPages(raw: string): PageText[] {
  try {
    const parsed = extractJsonFromLlm(raw) as {
      pages?: Array<{ page?: number; text?: string }>;
    };
    const pages: PageText[] = [];
    if (Array.isArray(parsed?.pages)) {
      for (const item of parsed.pages) {
        const page = typeof item.page === 'number' ? item.page : pages.length + 1;
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
    return [{ page: 1, text: plain.slice(0, 100_000) }];
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
    const maxPages = Math.min(
      pageCount > 0 ? pageCount : VISION_OCR_MAX_PAGES,
      VISION_OCR_MAX_PAGES,
    );
    const ocrPdf = await slicePdfFirstPages(pdfBuffer, maxPages);
    const result = await llm.completeWithPdf({
      system: OCR_SYSTEM,
      prompt: `Извлеки текст со страниц 1–${maxPages} этого PDF-скана. Верни JSON {"pages":[...]}.`,
      pdf: ocrPdf,
      filename: `${documentId}.pdf`,
      maxTokens: 4000,
    });

    const pages = parseOcrPages(result.text);
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
          model: result.model,
          pageCount: pages.length,
          textChars: text.length,
          textSource: 'vision-ocr',
        },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'vision-ocr failed';
    await prisma.documentVersion.update({
      where: { id: versionId },
      data: { visionOcrStatus: 'failed' },
    });
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'failed',
        payload: { ...jobPayload, documentId, versionId, error: message },
      },
    });
    throw err;
  }
}
