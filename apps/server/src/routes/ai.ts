import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { exportReportKey } from '@folio-mind/pdf-contracts';
import { findDocumentForUser, getAuthUser } from '../lib/document-access.js';
import { getCachedSummary } from '../lib/ai-cache.js';
import { AiLimitError, checkAndIncrementAiUsage, getAiUsageToday } from '../lib/ai-limits.js';
import type { Env } from '../lib/env.js';
import { createLLMFromEnv, getAiProviderCatalog, getConfiguredProviderName } from '../lib/llm.js';
import { enqueueAiJob } from '../lib/queue.js';
import { getPresignedGetUrl, isS3Configured, putObjectByKey } from '../lib/s3.js';
import { resolveDefaultProvider, type AIProviderName } from '@folio-mind/ai-providers';

const errorBody = z.object({ error: z.string() });

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

      const markdown = buildReportMarkdown({
        title: document.title,
        version: version.version,
        summary: cached.summary,
        chatMessages: request.body.chatMessages ?? [],
      });

      const key = exportReportKey(documentId, versionId);
      await putObjectByKey({
        key,
        body: Buffer.from(markdown, 'utf8'),
        contentType: 'text/markdown; charset=utf-8',
      });

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
