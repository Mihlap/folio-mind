import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  exportReportKey,
  exportReportPdfKey,
  exportReportWordKey,
  listExtractionTemplates,
  resolveS3Key,
  validateExtractionSchema,
} from '@folio-mind/pdf-contracts';
import { findDocumentForUser, getAuthUser } from '../lib/documents/document-access.js';
import { getCachedSummary } from '../lib/ai/ai-cache.js';
import {
  AiLimitError,
  checkAndIncrementAiUsage,
  decrementAiUsage,
  getAiUsageToday,
} from '../lib/ai/ai-limits.js';
import type { Env } from '../lib/config/env.js';
import {
  createLLMFromEnv,
  getAiProviderCatalog,
  getConfiguredProviderName,
} from '../lib/ai/llm.js';
import { enqueueAiJob, enqueueApplyAcceptedSuggestionsJob } from '../lib/queue/queue.js';
import {
  publishVersionCreatedDocumentEvent,
  // publishAnnotationDocumentEvent,
  // publishSuggestionStatusDocumentEvent,
} from '../lib/events/document-events-bus.js';
import { getPresignedGetUrl, isS3Configured, putObjectByKey } from '../lib/storage/s3.js';
import { resolveDefaultProvider, type AIProviderName } from '@folio-mind/ai-providers';
const errorBody = z.object({ error: z.string() });
const require = createRequire(import.meta.url);
// function linkedSuggestionIdFromMeta(meta: unknown): string | null {
//   if (!meta || typeof meta !== 'object') return null;
//   const id = (meta as { suggestionId?: unknown }).suggestionId;
//   return typeof id === 'string' ? id : null;
// }
function buildOriginalKey(documentId: string, version: number, fileName: string) {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return resolveS3Key('originals', `${documentId}/v${version}-${safeName}`);
}
const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().max(16000),
});
function buildReportMarkdown(params: {
  title: string;
  version: number;
  summary: string;
  chatMessages: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
}): string {
  const lines = [
    `# Отчёт по документу: ${params.title}`,
    '',
    `**Версия:** ${params.version}`,
    `**Дата:** ${new Date().toISOString()}`,
    '',
    '## Пересказ',
    '',
    params.summary,
  ];
  if (params.chatMessages.length > 0) {
    lines.push('', '## Диалог с ИИ', '');
    for (const msg of params.chatMessages) {
      const label = msg.role === 'user' ? 'Вопрос' : 'Ответ';
      lines.push(`### ${label}`, '', msg.content, '');
    }
  }
  lines.push('', '---', '_Сгенерировано РазУм_');
  return lines.join('\n');
}
function buildWordHtml(params: {
  title: string;
  version: number;
  summary: string;
  chatMessages: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
}): string {
  const escapeHtml = (value: string) =>
    value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  const chatHtml =
    params.chatMessages.length === 0
      ? ''
      : `<h2>Диалог с ИИ</h2>${params.chatMessages
          .map(
            (msg) =>
              `<h3>${msg.role === 'user' ? 'Вопрос' : 'Ответ'}</h3><p>${escapeHtml(msg.content).replaceAll('\n', '<br/>')}</p>`,
          )
          .join('')}`;
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: Arial, sans-serif; color: #111827; line-height: 1.45; }
    h1 { font-size: 24px; margin-bottom: 12px; }
    h2 { font-size: 18px; margin-top: 18px; margin-bottom: 8px; }
    h3 { font-size: 15px; margin-top: 12px; margin-bottom: 6px; }
    .meta { color: #4b5563; margin-bottom: 8px; }
  </style>
</head>
<body>
  <h1>Отчёт по документу: ${escapeHtml(params.title)}</h1>
  <div class="meta">Версия: ${params.version}</div>
  <div class="meta">Дата: ${new Date().toISOString()}</div>
  <h2>Пересказ</h2>
  <p>${escapeHtml(params.summary).replaceAll('\n', '<br/>')}</p>
  ${chatHtml}
  <hr />
  <p style="color:#6b7280;">Сгенерировано РазУм</p>
</body>
</html>`;
}
async function buildPdfReport(params: {
  title: string;
  version: number;
  summary: string;
  chatMessages: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
}): Promise<Buffer> {
  const PdfKitModule = require('pdfkit');
  const PDFDocument = PdfKitModule?.default ?? PdfKitModule;
  return await new Promise<Buffer>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('PDF generation timeout')), 15000);
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 48 });
      const chunks: Buffer[] = [];
      const fontCandidates = ['C:/Windows/Fonts/arial.ttf', 'C:/Windows/Fonts/segoeui.ttf'];
      const fontPath = fontCandidates.find((candidate) => existsSync(candidate));
      if (fontPath) {
        doc.font(fontPath);
      }
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => {
        clearTimeout(timeout);
        resolve(Buffer.concat(chunks));
      });
      doc.on('error', (error: Error) => {
        clearTimeout(timeout);
        reject(error);
      });
      doc.fontSize(18).text(`Отчёт по документу: ${params.title}`);
      doc.moveDown(0.4);
      doc.fillColor('#4B5563').fontSize(10).text(`Версия: ${params.version}`);
      doc.text(`Дата: ${new Date().toISOString()}`);
      doc.fillColor('#111827');
      doc.moveDown(1);
      doc.fontSize(14).text('Пересказ');
      doc.moveDown(0.3);
      doc.fontSize(11).text(params.summary, { lineGap: 2 });
      if (params.chatMessages.length > 0) {
        doc.moveDown(1);
        doc.fontSize(14).text('Диалог с ИИ');
        for (const msg of params.chatMessages) {
          doc.moveDown(0.6);
          doc.fontSize(12).text(msg.role === 'user' ? 'Вопрос' : 'Ответ');
          doc.moveDown(0.2);
          doc.fontSize(11).text(msg.content, { lineGap: 2 });
        }
      }
      doc.moveDown(1.2);
      doc.fillColor('#6B7280').fontSize(9).text('Сгенерировано РазУм');
      doc.end();
    } catch (error) {
      clearTimeout(timeout);
      reject(error);
    }
  });
}
export const aiRoutes: FastifyPluginAsync<{
  env: Env;
}> = async (app, opts) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const env = opts.env;

  async function markAiEnqueueFailed(jobId: string, tenantId: string, err: unknown): Promise<void> {
    const message = err instanceof Error ? err.message : 'Failed to enqueue AI job';
    await decrementAiUsage(env, tenantId);
    await app.prisma.job.update({
      where: { id: jobId },
      data: { status: 'failed', payload: { error: message } },
    });
  }

  async function markVersionOperationEnqueueFailed(
    operationJobId: string,
    targetVersionId: string,
    err: unknown,
  ): Promise<void> {
    const message = err instanceof Error ? err.message : 'Failed to enqueue operation job';
    await app.prisma.$transaction([
      app.prisma.documentVersion.update({
        where: { id: targetVersionId },
        data: { status: 'failed' },
      }),
      app.prisma.job.update({
        where: { id: operationJobId },
        data: { status: 'failed', payload: { error: message } },
      }),
    ]);
  }
  r.get(
    '/ai/providers',
    {
      preHandler: [app.authenticate],
      schema: {
        response: {
          200: z.object({
            defaultProvider: z.enum(['gigachat', 'yandex']),
            providers: z.array(
              z.object({
                id: z.enum(['gigachat', 'yandex']),
                label: z.string(),
                configured: z.boolean(),
                active: z.boolean(),
              }),
            ),
            usageToday: z.number(),
            dailyLimit: z.number(),
          }),
        },
      },
    },
    async (request) => {
      const user = getAuthUser(request);
      const defaultProvider = getConfiguredProviderName(env);
      return {
        defaultProvider,
        providers: getAiProviderCatalog(env),
        usageToday: await getAiUsageToday(env, user.tenantId),
        dailyLimit: env.AI_TENANT_DAILY_REQUESTS,
      };
    },
  );
  const extractionFieldResponseSchema: z.ZodType<{
    name: string;
    label: string;
    type: string;
    description: string;
    children?: Array<{
      name: string;
      label: string;
      type: string;
      description: string;
      children?: unknown[];
    }>;
  }> = z.lazy(() =>
    z.object({
      name: z.string(),
      label: z.string(),
      type: z.string(),
      description: z.string(),
      children: z.array(extractionFieldResponseSchema).optional(),
    }),
  );
  r.get(
    '/ai/extraction-templates',
    {
      preHandler: [app.authenticate],
      schema: {
        response: {
          200: z.object({
            templates: z.array(
              z.object({
                id: z.enum(['contract', 'contract_sections', 'act', 'tz']),
                title: z.string(),
                description: z.string(),
                schema: z.array(extractionFieldResponseSchema),
              }),
            ),
          }),
        },
      },
    },
    async () => ({
      templates: listExtractionTemplates().map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        schema: t.schema,
      })),
    }),
  );
  r.post(
    '/ai/complete',
    {
      preHandler: [app.authenticate],
      schema: {
        body: z.object({
          prompt: z.string().min(1).max(32000),
          system: z.string().max(8000).optional(),
          provider: z.enum(['gigachat', 'yandex']).optional(),
        }),
        response: {
          200: z.object({
            text: z.string(),
            model: z.string(),
            provider: z.enum(['gigachat', 'yandex']),
          }),
          429: errorBody,
        },
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      try {
        await checkAndIncrementAiUsage(env, user.tenantId);
      } catch (err) {
        if (err instanceof AiLimitError) {
          return reply.code(429).send({ error: err.message });
        }
        throw err;
      }
      const providerName: AIProviderName = request.body.provider ?? getConfiguredProviderName(env);
      const llm = createLLMFromEnv(env, providerName);
      const result = await llm.complete({
        prompt: request.body.prompt,
        system: request.body.system,
      });
      return {
        text: result.text,
        model: result.model,
        provider: resolveDefaultProvider(providerName),
      };
    },
  );
  r.post(
    '/documents/:documentId/versions/:versionId/ai/summary',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({
          documentId: z.string(),
          versionId: z.string(),
        }),
        body: z.object({
          provider: z.enum(['gigachat', 'yandex']).optional(),
        }),
        response: {
          200: z.object({ jobId: z.string(), status: z.string(), cached: z.boolean().optional() }),
          202: z.object({ jobId: z.string(), status: z.string() }),
          400: errorBody,
          404: errorBody,
          429: errorBody,
        },
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const { documentId, versionId } = request.params;
      const provider = request.body.provider ?? getConfiguredProviderName(env);
      const document = await findDocumentForUser(app.prisma, documentId, user, { capability: 'edit' });
      if (!document) {
        return reply.code(404).send({ error: 'Document not found' });
      }
      const version = document.versions.find((v: { id: string }) => v.id === versionId);
      if (!version || version.status === 'pending_upload') {
        return reply.code(400).send({ error: 'Version not ready' });
      }
      const cached = await getCachedSummary(env, versionId);
      if (cached) {
        const job = await app.prisma.job.create({
          data: {
            type: 'ai-summary',
            status: 'completed',
            tenantId: user.tenantId,
            payload: {
              documentId,
              versionId,
              provider: cached.provider,
              model: cached.model,
              summary: cached.summary,
              cached: true,
            },
          },
        });
        return { jobId: job.id, status: 'completed', cached: true };
      }
      try {
        await checkAndIncrementAiUsage(env, user.tenantId);
      } catch (err) {
        if (err instanceof AiLimitError) {
          return reply.code(429).send({ error: err.message });
        }
        throw err;
      }
      const job = await app.prisma.job.create({
        data: {
          type: 'ai-summary',
          status: 'queued',
          tenantId: user.tenantId,
          payload: {
            documentId,
            versionId,
            provider,
          },
        },
      });
      try {
        await enqueueAiJob(env, {
          jobId: job.id,
          documentId,
          versionId,
          tenantId: user.tenantId,
          type: 'summary',
          requestId: request.requestId,
        });
      } catch (err) {
        await markAiEnqueueFailed(job.id, user.tenantId, err);
        throw err;
      }
      return reply.status(202).send({ jobId: job.id, status: 'queued' });
    },
  );
  r.post(
    '/documents/:documentId/versions/:versionId/ai/chat',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({
          documentId: z.string(),
          versionId: z.string(),
        }),
        body: z.object({
          prompt: z.string().min(1).max(8000),
          provider: z.enum(['gigachat', 'yandex']).optional(),
          history: z.array(chatMessageSchema).max(20).optional(),
        }),
        response: {
          202: z.object({ jobId: z.string(), status: z.string() }),
          400: errorBody,
          404: errorBody,
          429: errorBody,
        },
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const { documentId, versionId } = request.params;
      const provider = request.body.provider ?? getConfiguredProviderName(env);
      const document = await findDocumentForUser(app.prisma, documentId, user, { capability: 'edit' });
      if (!document) {
        return reply.code(404).send({ error: 'Document not found' });
      }
      const version = document.versions.find((v: { id: string }) => v.id === versionId);
      if (!version || version.status === 'pending_upload') {
        return reply.code(400).send({ error: 'Version not ready' });
      }
      try {
        await checkAndIncrementAiUsage(env, user.tenantId);
      } catch (err) {
        if (err instanceof AiLimitError) {
          return reply.code(429).send({ error: err.message });
        }
        throw err;
      }
      const job = await app.prisma.job.create({
        data: {
          type: 'ai-chat',
          status: 'queued',
          tenantId: user.tenantId,
          payload: {
            documentId,
            versionId,
            provider,
            prompt: request.body.prompt,
            history: request.body.history ?? [],
          },
        },
      });
      try {
        await enqueueAiJob(env, {
          jobId: job.id,
          documentId,
          versionId,
          tenantId: user.tenantId,
          type: 'chat',
          prompt: request.body.prompt,
          requestId: request.requestId,
        });
      } catch (err) {
        await markAiEnqueueFailed(job.id, user.tenantId, err);
        throw err;
      }
      return reply.status(202).send({ jobId: job.id, status: 'queued' });
    },
  );
  /* ИИ-предложения правок временно отключены — остаются только ручные правки
  const suggestionItemSchema = z.object({
    id: z.string(),
    fragmentId: z.string(),
    originalText: z.string(),
    suggestion: z.string(),
    reason: z.string(),
    page: z.number().nullable(),
    quoteMatched: z.boolean(),
    status: z.string(),
    annotationId: z.string().nullable(),
    createdAt: z.string(),
  });
  r.get(
    '/documents/:documentId/versions/:versionId/ai/suggestions',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ documentId: z.string(), versionId: z.string() }),
        response: {
          200: z.object({ items: z.array(suggestionItemSchema) }),
          404: errorBody,
        },
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const { documentId, versionId } = request.params;
      const document = await findDocumentForUser(app.prisma, documentId, user, { capability: 'edit' });
      if (!document) {
        return reply.code(404).send({ error: 'Document not found' });
      }
      if (!document.versions.some((v: { id: string }) => v.id === versionId)) {
        return reply.code(404).send({ error: 'Version not found' });
      }
      const items = await app.prisma.aiSuggestion.findMany({
        where: { documentId, versionId, tenantId: user.tenantId },
        orderBy: { createdAt: 'asc' },
      });
      const annotations = await app.prisma.documentAnnotation.findMany({
        where: { documentId, versionId, kind: 'accepted_edit' },
        select: { id: true, meta: true },
      });
      const annotationBySuggestionId = new Map<string, string>();
      for (const ann of annotations) {
        const suggestionId = linkedSuggestionIdFromMeta(ann.meta);
        if (suggestionId && !annotationBySuggestionId.has(suggestionId)) {
          annotationBySuggestionId.set(suggestionId, ann.id);
        }
      }
      return {
        items: items.map((item) => ({
          id: item.id,
          fragmentId: item.fragmentId,
          originalText: item.originalText,
          suggestion: item.suggestion,
          reason: item.reason,
          page: item.page,
          quoteMatched: item.quoteMatched,
          status: item.status,
          annotationId: annotationBySuggestionId.get(item.id) ?? null,
          createdAt: item.createdAt.toISOString(),
        })),
      };
    },
  );
  r.post(
    '/documents/:documentId/versions/:versionId/ai/suggestions',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ documentId: z.string(), versionId: z.string() }),
        body: z
          .object({
            provider: z.enum(['gigachat', 'yandex']).optional(),
            scope: z.enum(['document', 'page']).optional(),
            page: z.number().int().min(1).optional(),
          })
          .refine((body) => body.scope !== 'page' || body.page != null, {
            message: 'page is required when scope is page',
          }),
        response: {
          202: z.object({ jobId: z.string(), status: z.string() }),
          400: errorBody,
          404: errorBody,
          429: errorBody,
        },
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const { documentId, versionId } = request.params;
      const provider = request.body.provider ?? getConfiguredProviderName(env);
      const scope = request.body.scope ?? 'document';
      const page = request.body.page;
      const document = await findDocumentForUser(app.prisma, documentId, user, { capability: 'edit' });
      if (!document) {
        return reply.code(404).send({ error: 'Document not found' });
      }
      const version = document.versions.find((v: { id: string }) => v.id === versionId);
      if (!version || version.status !== 'ready') {
        return reply.code(400).send({ error: 'Version not ready' });
      }
      if (scope === 'page') {
        if (!page) {
          return reply.code(400).send({ error: 'Укажите номер страницы' });
        }
        if (version.pageCount && page > version.pageCount) {
          return reply
            .code(400)
            .send({ error: `Страница ${page} больше числа страниц (${version.pageCount})` });
        }
      }
      try {
        await checkAndIncrementAiUsage(env, user.tenantId);
      } catch (err) {
        if (err instanceof AiLimitError) {
          return reply.code(429).send({ error: err.message });
        }
        throw err;
      }
      const job = await app.prisma.job.create({
        data: {
          type: 'ai-suggestions',
          status: 'queued',
          tenantId: user.tenantId,
          payload: {
            documentId,
            versionId,
            provider,
            scope,
            ...(scope === 'page' ? { page } : {}),
          },
        },
      });
      try {
        await enqueueAiJob(env, {
          jobId: job.id,
          documentId,
          versionId,
          tenantId: user.tenantId,
          type: 'suggestions',
          requestId: request.requestId,
        });
      } catch (err) {
        await markAiEnqueueFailed(job.id, user.tenantId, err);
        throw err;
      }
      return reply.status(202).send({ jobId: job.id, status: 'queued' });
    },
  );
  r.patch(
    '/documents/:documentId/versions/:versionId/ai/suggestions/:suggestionId',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({
          documentId: z.string(),
          versionId: z.string(),
          suggestionId: z.string(),
        }),
        body: z.object({
          status: z.enum(['accepted', 'rejected']),
          originalText: z.string().trim().min(1).max(300).optional(),
        }),
        response: {
          200: suggestionItemSchema,
          404: errorBody,
        },
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const { documentId, versionId, suggestionId } = request.params;
      const suggestion = await app.prisma.aiSuggestion.findFirst({
        where: {
          id: suggestionId,
          documentId,
          versionId,
          tenantId: user.tenantId,
        },
      });
      if (!suggestion) {
        return reply.code(404).send({ error: 'Suggestion not found' });
      }
      const textOverride =
        request.body.originalText !== undefined ? request.body.originalText.trim() : null;
      const effectiveOriginalText = textOverride ?? suggestion.originalText;
      if (suggestion.status === request.body.status && !textOverride) {
        return {
          id: suggestion.id,
          fragmentId: suggestion.fragmentId,
          originalText: suggestion.originalText,
          suggestion: suggestion.suggestion,
          reason: suggestion.reason,
          page: suggestion.page,
          quoteMatched: suggestion.quoteMatched,
          status: suggestion.status,
          annotationId: null,
          createdAt: suggestion.createdAt.toISOString(),
        };
      }
      const updated = await app.prisma.aiSuggestion.update({
        where: { id: suggestionId },
        data: {
          status: request.body.status,
          ...(textOverride && textOverride !== suggestion.originalText
            ? { originalText: textOverride, quoteMatched: true }
            : {}),
        },
      });
      void publishSuggestionStatusDocumentEvent(
        env,
        documentId,
        versionId,
        request.body.status,
        suggestionId,
      ).catch((err) => {
        request.log.warn({ err }, 'suggestion status event publish failed');
      });
      let linkedAnnotationId: string | null = null;
      if (request.body.status === 'accepted') {
        const page = suggestion.page ?? 1;
        const existingAnnotation = await app.prisma.documentAnnotation.findFirst({
          where: {
            documentId,
            versionId,
            page,
            kind: 'accepted_edit',
            quote: effectiveOriginalText,
            content: suggestion.suggestion,
          },
          select: { id: true },
        });
        if (existingAnnotation) {
          linkedAnnotationId = existingAnnotation.id;
        } else {
          const created = await app.prisma.documentAnnotation.create({
            data: {
              documentId,
              versionId,
              userId: user.sub,
              page,
              kind: 'accepted_edit',
              content: suggestion.suggestion,
              quote: effectiveOriginalText,
              meta: { suggestionId: suggestion.id, reason: suggestion.reason },
            },
          });
          linkedAnnotationId = created.id;
          void publishAnnotationDocumentEvent(
            env,
            documentId,
            versionId,
            'created',
            created.id,
          ).catch((err) => {
            request.log.warn({ err }, 'annotation created event publish failed');
          });
        }
      }
      await app.prisma.auditLog.create({
        data: {
          action:
            request.body.status === 'accepted'
              ? 'ai.suggestion_accepted'
              : 'ai.suggestion_rejected',
          userId: user.sub,
          tenantId: user.tenantId,
          documentId,
          meta: { suggestionId, versionId, fragmentId: suggestion.fragmentId },
        },
      });
      return {
        id: updated.id,
        fragmentId: updated.fragmentId,
        originalText: updated.originalText,
        suggestion: updated.suggestion,
        reason: updated.reason,
        page: updated.page,
        quoteMatched: updated.quoteMatched,
        status: updated.status,
        annotationId: linkedAnnotationId,
        createdAt: updated.createdAt.toISOString(),
      };
    },
  );
  */
  r.post(
    '/documents/:documentId/versions/:versionId/ai/apply-accepted',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ documentId: z.string(), versionId: z.string() }),
        response: {
          202: z.object({
            operationJobId: z.string(),
            versionId: z.string(),
            version: z.number(),
            status: z.literal('processing'),
          }),
          400: errorBody,
          404: errorBody,
          503: errorBody,
        },
      },
    },
    async (request, reply) => {
      if (!isS3Configured()) {
        return reply.code(503).send({ error: 'S3 is not configured' });
      }
      const user = getAuthUser(request);
      const { documentId, versionId } = request.params;
      const document = await findDocumentForUser(app.prisma, documentId, user, { capability: 'edit' });
      if (!document) {
        return reply.code(404).send({ error: 'Document not found' });
      }
      const sourceVersion = document.versions.find((v: { id: string }) => v.id === versionId);
      if (!sourceVersion || sourceVersion.status !== 'ready') {
        return reply.code(400).send({ error: 'Source version is not ready' });
      }
      const [acceptedAiCount, manualEditsCount] = await Promise.all([
        app.prisma.aiSuggestion.count({
          where: { documentId, versionId, tenantId: user.tenantId, status: 'accepted' },
        }),
        app.prisma.documentAnnotation.count({
          where: { documentId, versionId, kind: 'accepted_edit' },
        }),
      ]);
      if (acceptedAiCount === 0 && manualEditsCount === 0) {
        return reply.code(400).send({
          error: 'Нет правок для сборки. Добавьте свои в «Аннотации» или примите предложения ИИ.',
        });
      }
      const nextVersionNumber = (document.versions[0]?.version ?? 0) + 1;
      const targetS3Key = buildOriginalKey(
        document.id,
        nextVersionNumber,
        `edits-from-v${sourceVersion.version}.pdf`,
      );
      const [targetVersion, operationJob] = await app.prisma.$transaction([
        app.prisma.documentVersion.create({
          data: {
            documentId: document.id,
            version: nextVersionNumber,
            s3Key: targetS3Key,
            size: BigInt(0),
            mimeType: sourceVersion.mimeType,
            status: 'processing',
            sourceVersionId: sourceVersion.id,
          },
        }),
        app.prisma.job.create({
          data: {
            type: 'pdf-apply-edits',
            status: 'queued',
            tenantId: user.tenantId,
            payload: {
              documentId,
              sourceVersionId: sourceVersion.id,
              acceptedAiCount,
              manualEditsCount,
            },
          },
        }),
      ]);
      try {
        await enqueueApplyAcceptedSuggestionsJob(env, {
          jobId: `apply-edits-${targetVersion.id}`,
          operationJobId: operationJob.id,
          documentId,
          sourceVersionId: sourceVersion.id,
          targetVersionId: targetVersion.id,
          tenantId: user.tenantId,
          sourceS3Key: sourceVersion.s3Key,
          targetS3Key,
          requestId: request.requestId,
        });
      } catch (err) {
        await markVersionOperationEnqueueFailed(operationJob.id, targetVersion.id, err);
        throw err;
      }
      await app.prisma.auditLog.create({
        data: {
          action: 'document.version_apply_ai_edits',
          userId: user.sub,
          tenantId: user.tenantId,
          documentId,
          meta: {
            sourceVersionId: sourceVersion.id,
            targetVersionId: targetVersion.id,
            acceptedAiCount,
            manualEditsCount,
            operationJobId: operationJob.id,
          },
        },
      });
      void publishVersionCreatedDocumentEvent(env, document.id, targetVersion.id, targetVersion.version).catch((err) => {
        request.log.warn({ err }, 'version_created event publish failed');
      });
      return reply.status(202).send({
        operationJobId: operationJob.id,
        versionId: targetVersion.id,
        version: targetVersion.version,
        status: 'processing',
      });
    },
  );
  r.post(
    '/documents/:documentId/versions/:versionId/rag/compare',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ documentId: z.string(), versionId: z.string() }),
        body: z.object({
          query: z.string().max(500).optional(),
          provider: z.enum(['gigachat', 'yandex']).optional(),
        }),
        response: {
          202: z.object({ jobId: z.string(), status: z.string() }),
          400: errorBody,
          404: errorBody,
          429: errorBody,
        },
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const { documentId, versionId } = request.params;
      const provider = request.body.provider ?? getConfiguredProviderName(env);
      const document = await findDocumentForUser(app.prisma, documentId, user, { capability: 'edit' });
      if (!document) {
        return reply.code(404).send({ error: 'Document not found' });
      }
      const version = document.versions.find((v: { id: string }) => v.id === versionId);
      if (!version || version.status !== 'ready') {
        return reply.code(400).send({ error: 'Version not ready' });
      }
      try {
        await checkAndIncrementAiUsage(env, user.tenantId);
      } catch (err) {
        if (err instanceof AiLimitError) {
          return reply.code(429).send({ error: err.message });
        }
        throw err;
      }
      const job = await app.prisma.job.create({
        data: {
          type: 'rag-compare',
          status: 'queued',
          tenantId: user.tenantId,
          payload: {
            documentId,
            versionId,
            provider,
            query: request.body.query ?? 'сверка с регламентом',
          },
        },
      });
      try {
        await enqueueAiJob(env, {
          jobId: job.id,
          documentId,
          versionId,
          tenantId: user.tenantId,
          type: 'rag-compare',
          prompt: request.body.query,
          requestId: request.requestId,
        });
      } catch (err) {
        await markAiEnqueueFailed(job.id, user.tenantId, err);
        throw err;
      }
      return reply.status(202).send({ jobId: job.id, status: 'queued' });
    },
  );
  r.post(
    '/documents/:documentId/versions/:versionId/ai/extract',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ documentId: z.string(), versionId: z.string() }),
        body: z.object({
          templateId: z.enum(['contract', 'contract_sections', 'act', 'tz']).optional(),
          schema: z.array(z.record(z.unknown())).max(40).optional(),
          provider: z.enum(['gigachat', 'yandex']).optional(),
        }),
        response: {
          202: z.object({ jobId: z.string(), status: z.string() }),
          400: errorBody,
          404: errorBody,
          429: errorBody,
        },
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const { documentId, versionId } = request.params;
      const provider = request.body.provider ?? getConfiguredProviderName(env);
      const document = await findDocumentForUser(app.prisma, documentId, user, { capability: 'edit' });
      if (!document) {
        return reply.code(404).send({ error: 'Document not found' });
      }
      const version = document.versions.find((v: { id: string }) => v.id === versionId);
      if (!version || version.status !== 'ready') {
        return reply.code(400).send({ error: 'Version not ready' });
      }

      let customSchema: ReturnType<typeof validateExtractionSchema> | undefined;
      if (request.body.schema) {
        try {
          customSchema = validateExtractionSchema(request.body.schema);
        } catch (err) {
          return reply.code(400).send({
            error: err instanceof Error ? err.message : 'Некорректная схема извлечения',
          });
        }
      }
      if (!request.body.templateId && !customSchema) {
        return reply.code(400).send({
          error: 'Укажите templateId (contract|act|tz) или schema',
        });
      }

      try {
        await checkAndIncrementAiUsage(env, user.tenantId);
      } catch (err) {
        if (err instanceof AiLimitError) {
          return reply.code(429).send({ error: err.message });
        }
        throw err;
      }

      const job = await app.prisma.job.create({
        data: {
          type: 'document-extract',
          status: 'queued',
          tenantId: user.tenantId,
          payload: {
            documentId,
            versionId,
            provider,
            templateId: request.body.templateId ?? null,
            schema: customSchema ?? null,
          },
        },
      });
      try {
        await enqueueAiJob(env, {
          jobId: job.id,
          documentId,
          versionId,
          tenantId: user.tenantId,
          type: 'document-extract',
          requestId: request.requestId,
        });
      } catch (err) {
        await markAiEnqueueFailed(job.id, user.tenantId, err);
        throw err;
      }
      return reply.status(202).send({ jobId: job.id, status: 'queued' });
    },
  );
  r.post(
    '/documents/:documentId/versions/:versionId/ai/export',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({
          documentId: z.string(),
          versionId: z.string(),
        }),
        body: z.object({
          chatMessages: z.array(chatMessageSchema).max(50).optional(),
          format: z.enum(['md', 'pdf', 'word']).default('word'),
        }),
        response: {
          200: z.object({ url: z.string(), key: z.string() }),
          400: errorBody,
          404: errorBody,
          503: errorBody,
        },
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const { documentId, versionId } = request.params;
      const document = await findDocumentForUser(app.prisma, documentId, user, { capability: 'edit' });
      if (!document) {
        return reply.code(404).send({ error: 'Document not found' });
      }
      const version = document.versions.find(
        (v: { id: string; version: number; status: string }) => v.id === versionId,
      );
      if (!version || version.status === 'pending_upload') {
        return reply.code(400).send({ error: 'Version not ready' });
      }
      const cached = await getCachedSummary(env, versionId);
      if (!cached?.summary) {
        return reply.code(400).send({ error: 'Сначала получите пересказ документа' });
      }
      if (!isS3Configured()) {
        return reply.code(503).send({ error: 'S3 is not configured' });
      }
      const reportPayload = {
        title: document.title,
        version: version.version,
        summary: cached.summary,
        chatMessages: request.body.chatMessages ?? [],
      };
      const markdown = buildReportMarkdown(reportPayload);
      const format = request.body.format ?? 'md';
      const key =
        format === 'word'
          ? exportReportWordKey(documentId, versionId)
          : format === 'pdf'
            ? exportReportPdfKey(documentId, versionId)
            : exportReportKey(documentId, versionId);
      const payload =
        format === 'word'
          ? {
              key,
              body: Buffer.from(buildWordHtml(reportPayload), 'utf8'),
              contentType: 'application/msword; charset=utf-8',
            }
          : format === 'pdf'
            ? {
                key,
                body: await buildPdfReport(reportPayload),
                contentType: 'application/pdf',
              }
            : {
                key,
                body: Buffer.from(markdown, 'utf8'),
                contentType: 'text/markdown; charset=utf-8',
              };
      await putObjectByKey(payload);
      const url = await getPresignedGetUrl({ key, expiresInSeconds: 3600 });
      await app.prisma.auditLog.create({
        data: {
          action: 'document.export_report',
          userId: user.sub,
          tenantId: user.tenantId,
          documentId,
          meta: { versionId, key },
        },
      });
      return { url, key };
    },
  );
  r.get(
    '/jobs/:jobId',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ jobId: z.string() }),
        response: {
          200: z.object({
            id: z.string(),
            type: z.string(),
            status: z.string(),
            payload: z.unknown().nullable(),
            createdAt: z.string(),
            updatedAt: z.string(),
          }),
          404: errorBody,
        },
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const job = await app.prisma.job.findFirst({
        where: { id: request.params.jobId, tenantId: user.tenantId },
      });
      if (!job) {
        return reply.code(404).send({ error: 'Job not found' });
      }
      return {
        id: job.id,
        type: job.type,
        status: job.status,
        payload: job.payload,
        createdAt: job.createdAt.toISOString(),
        updatedAt: job.updatedAt.toISOString(),
      };
    },
  );
};
