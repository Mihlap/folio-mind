import { extractJsonFromLlm } from '@folio-mind/ai-contracts';
import type { AIProviderName } from '@folio-mind/ai-providers';
import {
  EXTRACTION_TEMPLATE_IDS,
  getExtractionTemplate,
  isExtractionTemplateId,
  sanitizeExtractedValue,
  schemaToPromptLines,
  type ExtractionFieldSchema,
  type ExtractionTemplateId,
} from '@folio-mind/pdf-contracts';
import type { WorkerJobPayload } from '../../lib/config/job-types.js';
import type { WorkerEnv } from '../../lib/config/env.js';
import { createLLMFromWorkerEnv } from '../../lib/ai/llm.js';
import { getPrisma } from '../../lib/infra/prisma.js';
import {
  formatPagesForAiPrompt,
  loadDocumentPagesForAi,
} from '../../lib/pdf/document-text.js';
import { getObjectBuffer, isWorkerS3Configured } from '../../lib/storage/s3.js';

type DocumentExtractPayload = WorkerJobPayload & {
  jobId?: string;
  documentId?: string;
  versionId?: string;
  tenantId?: string;
  templateId?: ExtractionTemplateId;
  schema?: ExtractionFieldSchema[];
  provider?: AIProviderName;
};

const EXTRACT_SYSTEM = `Ты извлекаешь структурированные данные из юридического документа.
Верни ТОЛЬКО валидный JSON-объект без markdown-ограждений.
Ключи JSON должны совпадать с именами полей схемы.

Правила:
- Не выдумывай отсутствующие факты.
- Пустые бланки в шапке (_____, « » 20__ г., Исполнитель-1 без названия) — null для полей имени/даты/номера.
- Но типовой договор часто уже содержит заполненные пункты (предмет, обязанности, оплата, сроки в днях, ответственность) — их НУЖНО извлекать, даже если в шапке есть прочерки.
- Для массива terms: 5–12 пунктов с topic + detail. detail — 1–2 предложения ПО СУТИ из текста (кто кому что обязан, сроки в днях, порядок оплаты, возврат денег, конфиденциальность, расторжение).
- Не пиши мета-фразы «описывает обязанности» / «перечисляет права» — пиши само условие.
- Если действительно нет ни одного содержательного пункта — {"terms":[]}.
Числа — number, булевы — boolean.`;

const TERMS_PROMPT_HINT = `
Обрати внимание: это может быть типовой бланк, но разделы 1–4 и далее обычно уже заполнены текстом условий.
Обязательно включи в terms то, что явно есть в тексте, например:
- предмет услуг;
- порядок и связь оплаты между сторонами;
- сроки (рабочие дни, календарные дни);
- акт приёма-сдачи;
- ответственность / возврат средств;
- конфиденциальность;
- расторжение — если есть.
Не оставляй terms пустым, если в тексте есть такие пункты.`;

function resolveSchema(jobPayload: Record<string, unknown>, data: DocumentExtractPayload): {
  title: string;
  schema: ExtractionFieldSchema[];
  templateId: ExtractionTemplateId | null;
} {
  const templateIdRaw = jobPayload.templateId ?? data.templateId;
  if (isExtractionTemplateId(templateIdRaw)) {
    const template = getExtractionTemplate(templateIdRaw);
    return { title: template.title, schema: template.schema, templateId: templateIdRaw };
  }
  const custom = (jobPayload.schema ?? data.schema) as ExtractionFieldSchema[] | undefined;
  if (Array.isArray(custom) && custom.length > 0) {
    return { title: 'Произвольная схема', schema: custom, templateId: null };
  }
  const fallback = getExtractionTemplate('contract');
  return { title: fallback.title, schema: fallback.schema, templateId: 'contract' };
}

function normalizeExtractedPayload(
  extracted: Record<string, unknown>,
  schema: ExtractionFieldSchema[],
): Record<string, unknown> {
  const cleaned = sanitizeExtractedValue(extracted);
  if (cleaned && typeof cleaned === 'object' && !Array.isArray(cleaned)) {
    return cleaned as Record<string, unknown>;
  }
  const empty: Record<string, unknown> = {};
  for (const field of schema) {
    if (field.type === 'array') empty[field.name] = [];
  }
  return empty;
}

function isExtractedPayloadEmpty(payload: Record<string, unknown>): boolean {
  const values = Object.values(payload);
  if (values.length === 0) return true;
  return values.every((v) => {
    if (v == null) return true;
    if (Array.isArray(v)) return v.length === 0;
    if (typeof v === 'object') return Object.keys(v as object).length === 0;
    return false;
  });
}

export async function processDocumentExtractJob(
  env: WorkerEnv,
  data: DocumentExtractPayload,
): Promise<void> {
  const prisma = getPrisma();
  const jobId = data.jobId;
  const documentId = data.documentId;
  const versionId = data.versionId;
  const tenantId = data.tenantId;
  if (!jobId || !documentId || !versionId || !tenantId) {
    throw new Error('document-extract job: missing required fields');
  }

  const dbJob = await prisma.job.findUnique({ where: { id: jobId } });
  if (!dbJob) throw new Error(`Job not found: ${jobId}`);
  const jobPayload = (dbJob.payload ?? {}) as Record<string, unknown>;
  const provider =
    (jobPayload.provider as AIProviderName | undefined) ?? data.provider ?? env.AI_PROVIDER;
  const resolved = resolveSchema(jobPayload, data);

  await prisma.job.update({ where: { id: jobId }, data: { status: 'processing' } });

  try {
    if (!isWorkerS3Configured()) {
      throw new Error('S3 не настроен в worker');
    }
    const version = await prisma.documentVersion.findUnique({
      where: { id: versionId },
      select: { s3Key: true, pageCount: true },
    });
    if (!version?.s3Key || version.s3Key === 'pending') {
      throw new Error('Версия документа без файла');
    }
    const pdfBuffer = await getObjectBuffer(version.s3Key);
    const pages = await loadDocumentPagesForAi(
      documentId,
      versionId,
      pdfBuffer,
      version.pageCount,
    );
    const documentText = formatPagesForAiPrompt(pages).trim();
    if (!documentText) {
      throw new Error(
        'Нет текста для извлечения. Для сканов дождитесь распознавания или используйте GigaChat.',
      );
    }

    const llm = createLLMFromWorkerEnv(env, provider);
    const schemaLines = schemaToPromptLines(resolved.schema);
    const termsHint =
      resolved.templateId === 'contract_sections' ? TERMS_PROMPT_HINT : '';
    const result = await llm.complete({
      system: EXTRACT_SYSTEM,
      prompt: `Шаблон: ${resolved.title}\n\nСхема полей:\n${schemaLines}${termsHint}\n\nТекст документа:\n${documentText.slice(0, 100_000)}`,
      maxTokens: 3500,
    });

    let extracted: unknown;
    try {
      extracted = extractJsonFromLlm(result.text);
    } catch {
      throw new Error('Модель вернула ответ не в формате JSON');
    }
    if (!extracted || typeof extracted !== 'object' || Array.isArray(extracted)) {
      throw new Error('Ожидался JSON-объект с данными');
    }
    const cleaned = normalizeExtractedPayload(
      extracted as Record<string, unknown>,
      resolved.schema,
    );

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
          templateId: resolved.templateId,
          templateTitle: resolved.title,
          extracted: cleaned as object,
          empty: Object.keys(cleaned).length === 0 || isExtractedPayloadEmpty(cleaned),
          availableTemplates: [...EXTRACTION_TEMPLATE_IDS],
        },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'document-extract failed';
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
