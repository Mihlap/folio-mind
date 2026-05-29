import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { exportReportKey, exportReportPdfKey, exportReportWordKey } from '@folio-mind/pdf-contracts';
import { findDocumentForUser, getAuthUser } from '../lib/documents/document-access.js';
import { getCachedSummary } from '../lib/ai/ai-cache.js';
import { AiLimitError, checkAndIncrementAiUsage, getAiUsageToday } from '../lib/ai/ai-limits.js';
import type { Env } from '../lib/config/env.js';
import { createLLMFromEnv, getAiProviderCatalog, getConfiguredProviderName } from '../lib/ai/llm.js';
import { enqueueAiJob } from '../lib/queue/queue.js';
import { getPresignedGetUrl, isS3Configured, putObjectByKey } from '../lib/storage/s3.js';
import { resolveDefaultProvider, type AIProviderName } from '@folio-mind/ai-providers';

const errorBody = z.object({ error: z.string() });
const require = createRequire(import.meta.url);

const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().max(16_000),
});


function buildReportMarkdown(params: {
  title: string;
  version: number;
  summary: string;
  chatMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
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

  lines.push('', '---', '_Сгенерировано Folio Mind / РазУм_');
  return lines.join('\n');
}

function buildWordHtml(params: {
  title: string;
  version: number;
  summary: string;
  chatMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
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
  <p style="color:#6b7280;">Сгенерировано Folio Mind / РазУм</p>
</body>
</html>`;
}

async function buildPdfReport(params: {
  title: string;
  version: number;
  summary: string;
  chatMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
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
      doc.fillColor('#6B7280').fontSize(9).text('Сгенерировано Folio Mind / РазУм');
      doc.end();
    } catch (error) {
      clearTimeout(timeout);
      reject(error);
    }
  });
}

export const aiRoutes: FastifyPluginAsync<{ env: Env }> = async (app, opts) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const env = opts.env;

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

  r.post(
    '/ai/complete',
    {
      preHandler: [app.authenticate],
      schema: {
        body: z.object({
          prompt: z.string().min(1).max(32_000),
          system: z.string().max(8_000).optional(),
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

      const providerName: AIProviderName =
        request.body.provider ?? getConfiguredProviderName(env);
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

      const document = await findDocumentForUser(app.prisma, documentId, user);
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

      await enqueueAiJob(env, {
        jobId: job.id,
        documentId,
        versionId,
        tenantId: user.tenantId,
        type: 'summary',
        requestId: request.requestId,
      });

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
          prompt: z.string().min(1).max(8_000),
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

      const document = await findDocumentForUser(app.prisma, documentId, user);
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

      await enqueueAiJob(env, {
        jobId: job.id,
        documentId,
        versionId,
        tenantId: user.tenantId,
        type: 'chat',
        prompt: request.body.prompt,
        requestId: request.requestId,
      });

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

      const document = await findDocumentForUser(app.prisma, documentId, user);
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
