import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { PrismaClient } from '@prisma/client';
import {
  PRESENTATION_AI_MODES,
  PRESENTATION_SLIDE_LAYOUTS,
  isPresentationAiMode,
  isPresentationSlideLayout,
  normalizeSlidePositions,
  type PresentationAiMode,
  type PresentationSlideLayout,
} from '@folio-mind/pdf-contracts';
import {
  getAuthUser,
  replyDocumentAccessError,
  requireDocumentAccess,
} from '../lib/documents/document-access.js';
import { fetchVersionPreviews } from '../lib/documents/fetch-version-previews.js';
import { enqueueAiJob, enqueueExportPresentationJob } from '../lib/queue/queue.js';
import { isS3Configured } from '../lib/storage/s3.js';
import { buildOriginalKey } from './documents/helpers.js';
import type { Env } from '../lib/config/env.js';

const aiModeSchema = z.enum(['none', 'advise', 'assemble', 'author']);
const layoutSchema = z.enum(['title_only', 'image_right', 'image_top', 'image_full', 'section']);

const errorBody = z.object({ error: z.string() });

const slideSchema = z.object({
  id: z.string(),
  position: z.number().int().min(0),
  title: z.string().nullable(),
  subtitle: z.string().nullable(),
  body: z.string().nullable(),
  notes: z.string().nullable(),
  layoutVariant: layoutSchema,
  background: z.string().nullable(),
  sourcePage: z.number().int().min(1).nullable(),
  mediaAssetId: z.string().nullable(),
});

const presentationSchema = z.object({
  id: z.string(),
  documentId: z.string().nullable(),
  versionId: z.string().nullable(),
  title: z.string(),
  aiMode: aiModeSchema,
  slides: z.array(slideSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const slideInputSchema = z.object({
  id: z.string().optional(),
  position: z.number().int().min(0),
  title: z.string().trim().max(200).nullable().optional(),
  subtitle: z.string().trim().max(300).nullable().optional(),
  body: z.string().trim().max(2000).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  layoutVariant: layoutSchema.default('image_top'),
  background: z.string().trim().max(32).nullable().optional(),
  sourcePage: z.number().int().min(1).nullable().optional(),
  mediaAssetId: z.string().nullable().optional(),
});

const normalizeSlideInput = (input: z.infer<typeof slideInputSchema>) => ({
  title: input.title ?? null,
  subtitle: input.subtitle ?? null,
  body: input.body ?? null,
  notes: input.notes ?? null,
  layoutVariant: input.layoutVariant,
  background: input.background ?? null,
  sourcePage: input.sourcePage ?? null,
  mediaAssetId: input.mediaAssetId ?? null,
});

type PresentationEntity = {
  id: string;
  documentId: string | null;
  versionId: string | null;
  title: string;
  aiMode: string;
  createdAt: Date;
  updatedAt: Date;
  slides: Array<{
    id: string;
    position: number;
    title: string | null;
    subtitle: string | null;
    body: string | null;
    notes: string | null;
    layoutVariant: string;
    background: string | null;
    sourcePage: number | null;
    mediaAssetId: string | null;
  }>;
};

function serializePresentation(entity: PresentationEntity) {
  return {
    id: entity.id,
    documentId: entity.documentId,
    versionId: entity.versionId,
    title: entity.title,
    aiMode: isPresentationAiMode(entity.aiMode) ? (entity.aiMode as PresentationAiMode) : 'none',
    slides: [...entity.slides]
      .sort((a, b) => a.position - b.position)
      .map((slide) => ({
        id: slide.id,
        position: slide.position,
        title: slide.title,
        subtitle: slide.subtitle,
        body: slide.body,
        notes: slide.notes,
        layoutVariant: isPresentationSlideLayout(slide.layoutVariant)
          ? (slide.layoutVariant as PresentationSlideLayout)
          : 'image_top',
        background: slide.background,
        sourcePage: slide.sourcePage,
        mediaAssetId: slide.mediaAssetId,
      })),
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}

type PresentationAccessResult =
  | {
      ok: true;
      presentation: {
        id: string;
        documentId: string | null;
        versionId: string | null;
        createdById: string;
        title: string;
      };
    }
  | { ok: false; code: 403 | 404; error: string };

async function requirePresentationAccess(
  prisma: PrismaClient,
  tenantId: string,
  userId: string,
  presentationId: string,
  capability: 'view' | 'edit',
): Promise<PresentationAccessResult> {
  const found = await prisma.presentation.findFirst({
    where: { id: presentationId, tenantId },
    select: { id: true, documentId: true, versionId: true, createdById: true, title: true },
  });
  if (!found) return { ok: false, code: 404, error: 'Презентация не найдена' };
  if (found.documentId) {
    const access = await requireDocumentAccess(
      prisma,
      found.documentId,
      { sub: userId, tenantId },
      capability,
    );
    if (!access.ok) {
      return access.reason === 'forbidden'
        ? { ok: false, code: 403, error: 'Недостаточно прав для этой операции' }
        : { ok: false, code: 404, error: 'Презентация не найдена' };
    }
    return { ok: true, presentation: found };
  }
  if (capability === 'edit' && found.createdById !== userId) {
    return { ok: false, code: 403, error: 'Недостаточно прав для этой операции' };
  }
  return { ok: true, presentation: found };
}

async function validateMediaOwnership(
  prisma: PrismaClient,
  tenantId: string,
  slides: z.infer<typeof slideInputSchema>[],
): Promise<boolean> {
  const mediaIds = slides
    .map((slide) => slide.mediaAssetId)
    .filter((id): id is string => typeof id === 'string');
  if (mediaIds.length === 0) return true;
  const owned = await prisma.mediaAsset.count({
    where: { id: { in: mediaIds }, tenantId },
  });
  return owned === new Set(mediaIds).size;
}

export const presentationRoutes: FastifyPluginAsync<{ env: Env }> = async (app, options) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const env = options.env;

  const loadPresentation = async (id: string, tenantId: string) =>
    app.prisma.presentation.findFirst({
      where: { id, tenantId },
      include: { slides: { orderBy: { position: 'asc' } } },
    });

  r.get(
    '/presentations',
    {
      preHandler: [app.authenticate],
      schema: {
        querystring: z.object({
          id: z.string().min(1).optional(),
          documentId: z.string().min(1).optional(),
          versionId: z.string().min(1).optional(),
          standalone: z.string().optional(),
        }),
        response: {
          200: z.object({
            item: presentationSchema.nullable().optional(),
            items: z.array(presentationSchema).optional(),
            total: z.number().optional(),
          }),
          400: errorBody,
          403: errorBody,
          404: errorBody,
        },
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const { id, standalone } = request.query;

      if (id) {
        const access = await requirePresentationAccess(
          app.prisma,
          user.tenantId,
          user.sub,
          id,
          'view',
        );
        if (!access.ok) return reply.code(access.code).send({ error: access.error });
        const found = await loadPresentation(id, user.tenantId);
        if (!found) return reply.code(404).send({ error: 'Презентация не найдена' });
        return { item: serializePresentation(found) };
      }

      if (standalone === '1') {
        const items = await app.prisma.presentation.findMany({
          where: { tenantId: user.tenantId, versionId: null, documentId: null },
          include: { slides: { orderBy: { position: 'asc' } } },
          orderBy: { updatedAt: 'desc' },
          take: 200,
        });
        return { items: items.map((item) => serializePresentation(item)), total: items.length };
      }

      if (request.query.documentId) {
        const access = await requireDocumentAccess(
          app.prisma,
          request.query.documentId,
          user,
          'view',
        );
        if (!access.ok) return replyDocumentAccessError(reply, access);

        const found = await app.prisma.presentation.findFirst({
          where: {
            documentId: access.document.id,
            tenantId: user.tenantId,
            ...(request.query.versionId ? { versionId: request.query.versionId } : {}),
          },
          include: { slides: { orderBy: { position: 'asc' } } },
        });
        if (!found) return { item: null };
        return { item: serializePresentation(found) };
      }

      return reply.code(400).send({ error: 'Не указан фильтр' });
    },
  );

  r.put(
    '/presentations',
    {
      preHandler: [app.authenticate],
      schema: {
        body: z.object({
          id: z.string().min(1).optional(),
          documentId: z.string().min(1).optional(),
          versionId: z.string().min(1).optional(),
          title: z.string().trim().min(1).max(200),
          aiMode: aiModeSchema.default('none'),
          slides: z.array(slideInputSchema).max(200).default([]),
        }),
        response: {
          200: presentationSchema,
          400: errorBody,
          403: errorBody,
          404: errorBody,
        },
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const { id, documentId, versionId, title, aiMode, slides } = request.body;
      const bound = Boolean(documentId || versionId);

      if (bound && (!documentId || !versionId)) {
        return reply.code(400).send({ error: 'Укажите и документ, и версию' });
      }
      if (!bound && id) {
        const access = await requirePresentationAccess(
          app.prisma,
          user.tenantId,
          user.sub,
          id,
          'edit',
        );
        if (!access.ok) return reply.code(access.code).send({ error: access.error });
      }

      if (bound && documentId) {
        const access = await requireDocumentAccess(app.prisma, documentId, user, 'edit');
        if (!access.ok) return replyDocumentAccessError(reply, access);

        const version = await app.prisma.documentVersion.findFirst({
          where: { id: versionId, documentId: access.document.id },
          select: { id: true, pageCount: true },
        });
        if (!version) {
          return reply.code(404).send({ error: 'Версия не найдена' });
        }

        const pageCount = version.pageCount ?? 0;
        for (const slide of slides) {
          if (slide.sourcePage != null && pageCount > 0 && slide.sourcePage > pageCount) {
            return reply.code(400).send({ error: `Страница ${slide.sourcePage} вне документа` });
          }
        }
      }

      if (!bound) {
        for (const slide of slides) {
          if (slide.sourcePage != null) {
            return reply
              .code(400)
              .send({ error: 'Слайд со страницей требует привязку к документу' });
          }
        }
      }

      const mediaOwned = await validateMediaOwnership(app.prisma, user.tenantId, slides);
      if (!mediaOwned) {
        return reply.code(400).send({ error: 'Неизвестный файл в слайде' });
      }

      const prepared = normalizeSlidePositions(slides).map((slide) => ({
        ...normalizeSlideInput(slide),
        position: slide.position,
      }));

      const saved = await app.prisma.$transaction(async (tx) => {
        let existingId: string | null = null;
        if (bound && versionId) {
          const existing = await tx.presentation.findFirst({
            where: { versionId, tenantId: user.tenantId },
            select: { id: true },
          });
          existingId = existing?.id ?? null;
        } else if (id) {
          existingId = id;
        }

        if (existingId) {
          await tx.presentationSlide.deleteMany({ where: { presentationId: existingId } });
          const updated = await tx.presentation.update({
            where: { id: existingId },
            data: { title, aiMode },
            select: {
              id: true,
              documentId: true,
              versionId: true,
              title: true,
              aiMode: true,
              createdAt: true,
              updatedAt: true,
            },
          });
          for (const slide of prepared) {
            await tx.presentationSlide.create({ data: { ...slide, presentationId: existingId } });
          }
          return updated;
        }

        const created = await tx.presentation.create({
          data: {
            tenantId: user.tenantId,
            documentId: bound ? (documentId ?? null) : null,
            versionId: bound ? (versionId ?? null) : null,
            title,
            aiMode,
            createdById: user.sub,
          },
          select: {
            id: true,
            documentId: true,
            versionId: true,
            title: true,
            aiMode: true,
            createdAt: true,
            updatedAt: true,
          },
        });
        for (const slide of prepared) {
          await tx.presentationSlide.create({ data: { ...slide, presentationId: created.id } });
        }
        return created;
      });

      const fresh = await loadPresentation(saved.id, user.tenantId);
      if (!fresh) return reply.code(404).send({ error: 'Презентация не найдена' });
      return serializePresentation(fresh);
    },
  );

  r.get(
    '/presentations/previews',
    {
      preHandler: [app.authenticate],
      schema: {
        querystring: z.object({
          documentId: z.string().min(1),
          versionId: z.string().min(1),
          from: z.coerce.number().int().min(1).optional(),
          to: z.coerce.number().int().min(1).optional(),
        }),
        response: {
          200: z.object({
            pageCount: z.number(),
            pages: z.array(z.object({ page: z.number(), url: z.string() })),
            status: z.enum(['processing', 'ready', 'partial', 'unavailable']),
          }),
          403: errorBody,
          404: errorBody,
          503: errorBody,
        },
      },
    },
    async (request, reply) => {
      if (!isS3Configured()) {
        return reply.code(503).send({ error: 'Просмотр временно недоступен' });
      }
      const user = getAuthUser(request);
      const access = await requireDocumentAccess(
        app.prisma,
        request.query.documentId,
        user,
        'view',
      );
      if (!access.ok) return replyDocumentAccessError(reply, access);

      const version = await app.prisma.documentVersion.findFirst({
        where: { id: request.query.versionId, documentId: access.document.id },
      });
      if (!version) {
        return reply.code(404).send({ error: 'Версия не найдена' });
      }

      const result = await fetchVersionPreviews({
        env,
        prisma: app.prisma,
        documentId: access.document.id,
        versionId: version.id,
        version,
        tenantId: access.document.tenantId,
        from: request.query.from,
        to: request.query.to,
        requestId: request.requestId,
        enqueueMissing: true,
        variant: 'thumb',
        allowThumbFallback: true,
      });

      return {
        pageCount: result.pageCount,
        pages: result.pages.map((page) => ({ page: page.page, url: page.url })),
        status: result.status,
      };
    },
  );

  r.post(
    '/presentations/export',
    {
      preHandler: [app.authenticate],
      schema: {
        body: z.object({
          presentationId: z.string().min(1).optional(),
          documentId: z.string().min(1).optional(),
          versionId: z.string().min(1).optional(),
        }),
        response: {
          202: z.object({
            documentId: z.string(),
            versionId: z.string(),
            operationJobId: z.string(),
            status: z.literal('processing'),
          }),
          400: errorBody,
          403: errorBody,
          404: errorBody,
          500: errorBody,
        },
      },
    },
    async (request, reply) => {
      if (!isS3Configured()) {
        return reply.code(400).send({ error: 'Хранилище недоступно' });
      }
      const user = getAuthUser(request);

      let presentationId: string;
      let title: string;
      let sourceDocumentId: string | null = null;
      let sourceVersionId: string | null = null;
      let projectId: string | null = null;

      if (request.body.presentationId) {
        const access = await requirePresentationAccess(
          app.prisma,
          user.tenantId,
          user.sub,
          request.body.presentationId,
          'edit',
        );
        if (!access.ok) return reply.code(access.code).send({ error: access.error });
        presentationId = request.body.presentationId;
        title = access.presentation.title;
        const presentation = await app.prisma.presentation.findFirst({
          where: { id: presentationId, tenantId: user.tenantId },
          include: { slides: { select: { id: true } } },
        });
        if (!presentation || presentation.slides.length === 0) {
          return reply.code(404).send({ error: 'Презентация не найдена или пуста' });
        }
        if (presentation.documentId && presentation.versionId) {
          sourceDocumentId = presentation.documentId;
          sourceVersionId = presentation.versionId;
          const document = await app.prisma.document.findFirst({
            where: { id: presentation.documentId },
            select: { projectId: true },
          });
          projectId = document?.projectId ?? null;
        }
      } else if (request.body.documentId && request.body.versionId) {
        const access = await requireDocumentAccess(
          app.prisma,
          request.body.documentId,
          user,
          'edit',
        );
        if (!access.ok) return replyDocumentAccessError(reply, access);

        const version = await app.prisma.documentVersion.findFirst({
          where: { id: request.body.versionId, documentId: access.document.id },
          select: { id: true },
        });
        if (!version) {
          return reply.code(404).send({ error: 'Версия не найдена' });
        }

        const presentation = await app.prisma.presentation.findFirst({
          where: { versionId: version.id, tenantId: user.tenantId },
          include: { slides: { select: { id: true } } },
        });
        if (!presentation || presentation.slides.length === 0) {
          return reply.code(404).send({ error: 'Презентация не найдена или пуста' });
        }
        presentationId = presentation.id;
        title = presentation.title;
        sourceDocumentId = access.document.id;
        sourceVersionId = version.id;
        projectId = access.document.projectId ?? null;
      } else {
        return reply.code(400).send({ error: 'Не указана презентация' });
      }

      const fileName = `${title.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'presentation'}.pdf`;
      const document = await app.prisma.document.create({
        data: {
          title: `${title} — PDF`,
          tenantId: user.tenantId,
          ownerId: user.sub,
          projectId,
          versions: {
            create: {
              version: 1,
              s3Key: 'pending',
              size: BigInt(0),
              mimeType: 'application/pdf',
              status: 'processing',
            },
          },
        },
        include: { versions: true },
      });
      const targetVersion = document.versions[0]!;
      const targetS3Key = buildOriginalKey(document.id, targetVersion.version, fileName);
      await app.prisma.documentVersion.update({
        where: { id: targetVersion.id },
        data: { s3Key: targetS3Key },
      });

      const operation = await app.prisma.job.create({
        data: {
          type: 'export-presentation-pdf',
          status: 'queued',
          tenantId: user.tenantId,
          payload: {
            presentationId,
            sourceDocumentId,
            sourceVersionId,
            targetDocumentId: document.id,
            targetVersionId: targetVersion.id,
            s3Key: targetS3Key,
          } satisfies Record<string, unknown>,
        },
      });
      try {
        await enqueueExportPresentationJob(env, {
          jobId: operation.id,
          operationJobId: operation.id,
          presentationId,
          sourceDocumentId: sourceDocumentId ?? undefined,
          sourceVersionId: sourceVersionId ?? undefined,
          targetDocumentId: document.id,
          targetVersionId: targetVersion.id,
          tenantId: user.tenantId,
          targetS3Key,
          requestId: request.requestId,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to enqueue export job';
        await app.prisma.$transaction([
          app.prisma.documentVersion.update({
            where: { id: targetVersion.id },
            data: { status: 'failed', failureDetails: message },
          }),
          app.prisma.job.update({
            where: { id: operation.id },
            data: { status: 'failed', payload: { error: message } },
          }),
        ]);
        return reply.code(500).send({ error: 'Не удалось поставить экспорт в очередь' });
      }
      await app.prisma.auditLog.create({
        data: {
          action: 'presentation.export_pdf',
          userId: user.sub,
          tenantId: user.tenantId,
          documentId: sourceDocumentId,
          meta: {
            presentationId,
            sourceDocumentId,
            sourceVersionId,
            targetDocumentId: document.id,
            targetVersionId: targetVersion.id,
            standalone: sourceDocumentId == null,
          } satisfies Record<string, unknown>,
        },
      });

      return reply.status(202).send({
        documentId: document.id,
        versionId: targetVersion.id,
        operationJobId: operation.id,
        status: 'processing' as const,
      });
    },
  );

  r.post(
    '/presentations/ai',
    {
      preHandler: [app.authenticate],
      schema: {
        body: z.object({
          documentId: z.string().min(1),
          versionId: z.string().min(1),
          mode: z.enum(['advise', 'assemble', 'author']),
        }),
        response: {
          202: z.object({ jobId: z.string(), status: z.literal('processing') }),
          400: errorBody,
          403: errorBody,
          404: errorBody,
        },
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const access = await requireDocumentAccess(app.prisma, request.body.documentId, user, 'edit');
      if (!access.ok) return replyDocumentAccessError(reply, access);

      const version = await app.prisma.documentVersion.findFirst({
        where: { id: request.body.versionId, documentId: access.document.id },
        select: { id: true, status: true },
      });
      if (!version) {
        return reply.code(404).send({ error: 'Версия не найдена' });
      }
      if (version.status !== 'ready') {
        return reply.code(400).send({ error: 'Дождитесь готовности версии' });
      }

      const presentation = await app.prisma.presentation.findFirst({
        where: { versionId: version.id, tenantId: user.tenantId },
        select: { id: true },
      });

      const job = await app.prisma.job.create({
        data: {
          type: 'presentation-ai',
          status: 'queued',
          tenantId: user.tenantId,
          payload: {
            presentationId: presentation?.id ?? null,
            documentId: access.document.id,
            versionId: version.id,
            mode: request.body.mode,
          },
        },
      });

      await enqueueAiJob(env, {
        jobId: job.id,
        documentId: access.document.id,
        versionId: version.id,
        tenantId: user.tenantId,
        type: 'presentation-ai',
        requestId: request.requestId,
      });

      await app.prisma.auditLog.create({
        data: {
          action: 'presentation.ai',
          userId: user.sub,
          tenantId: user.tenantId,
          documentId: access.document.id,
          meta: {
            presentationId: presentation?.id ?? null,
            mode: request.body.mode,
          },
        },
      });

      return reply.status(202).send({ jobId: job.id, status: 'processing' as const });
    },
  );

  r.delete(
    '/presentations',
    {
      preHandler: [app.authenticate],
      schema: {
        querystring: z.object({
          id: z.string().min(1).optional(),
          versionId: z.string().min(1).optional(),
        }),
        response: {
          200: z.object({ ok: z.boolean() }),
          400: errorBody,
          403: errorBody,
          404: errorBody,
        },
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const { id, versionId } = request.query;

      if (id) {
        const access = await requirePresentationAccess(
          app.prisma,
          user.tenantId,
          user.sub,
          id,
          'edit',
        );
        if (!access.ok) return reply.code(access.code).send({ error: access.error });
        await app.prisma.presentation.delete({ where: { id } });
        return { ok: true };
      }

      if (!versionId) {
        return reply.code(400).send({ error: 'Не указан идентификатор' });
      }
      const found = await app.prisma.presentation.findFirst({
        where: { versionId, tenantId: user.tenantId },
        select: { id: true },
      });
      if (!found) return reply.code(404).send({ error: 'Презентация не найдена' });

      await app.prisma.presentation.delete({ where: { id: found.id } });
      return { ok: true };
    },
  );
};

export const presentationMeta = {
  aiModes: PRESENTATION_AI_MODES,
  layouts: PRESENTATION_SLIDE_LAYOUTS,
};
