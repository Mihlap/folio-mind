import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { annotationMetaWithContentFormat } from '@folio-mind/edit-markdown';
import { findDocumentForUser, getAuthUser } from '../lib/documents/document-access.js';
import {
  isDocumentVersionAccessible,
  resolveUserDocumentRole,
} from '../lib/documents/document-permissions.js';
import { serializeDocumentAnnotation } from '../lib/documents/serialize-annotation.js';
import { publishAnnotationDocumentEvent } from '../lib/events/document-events-bus.js';
import type { Env } from '../lib/config/env.js';

const errorBody = z.object({ error: z.string() });
const contentFormatSchema = z.enum(['plain', 'markdown']);

const annotationSchema = z.object({
  id: z.string(),
  documentId: z.string(),
  versionId: z.string(),
  userId: z.string(),
  page: z.number(),
  kind: z.string(),
  content: z.string(),
  quote: z.string().nullable(),
  contentFormat: contentFormatSchema,
  x: z.number().nullable(),
  y: z.number().nullable(),
  hideOnExport: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const annotationKindSchema = z.enum([
  'comment',
  'highlight',
  'accepted_edit',
  'internal_arrow',
  'internal_frame',
]);

const createAnnotationSchema = z
  .object({
    page: z.number().int().min(1),
    x: z.number().optional(),
    y: z.number().optional(),
    pageWidthPx: z.number().positive().optional(),
    pageHeightPx: z.number().positive().optional(),
    content: z.string().min(1).max(8000),
    kind: annotationKindSchema.default('comment'),
    quote: z.string().max(4000).optional(),
    contentFormat: contentFormatSchema.optional(),
    hideOnExport: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.kind === 'accepted_edit' && !data.quote?.trim()) {
      ctx.addIssue({
        code: 'custom',
        message: 'Для правки нужен исходный текст (было)',
        path: ['quote'],
      });
    }
  });

const updateAnnotationSchema = z
  .object({
    page: z.number().int().min(1).optional(),
    content: z.string().min(1).max(8000).optional(),
    quote: z.string().max(4000).optional(),
    contentFormat: contentFormatSchema.optional(),
    hideOnExport: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (
      data.content === undefined &&
      data.quote === undefined &&
      data.page === undefined &&
      data.contentFormat === undefined &&
      data.hideOnExport === undefined
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Нет полей для обновления',
      });
    }
  });

function resolveCreateContentFormat(
  kind: z.infer<typeof annotationKindSchema>,
  contentFormat: 'plain' | 'markdown' | undefined,
): 'plain' | 'markdown' | undefined {
  if (kind === 'accepted_edit') return contentFormat ?? 'markdown';
  return contentFormat;
}

function requiredCapabilityForAnnotationKind(
  kind: z.infer<typeof annotationKindSchema>,
): 'comment' | 'edit' {
  return kind === 'accepted_edit' ? 'edit' : 'comment';
}

function linkedSuggestionIdFromMeta(meta: unknown): string | null {
  if (!meta || typeof meta !== 'object') return null;
  const id = (meta as { suggestionId?: unknown }).suggestionId;
  return typeof id === 'string' ? id : null;
}

export const annotationRoutes: FastifyPluginAsync<{ env: Env }> = async (app, { env }) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.get(
    '/documents/:documentId/versions/:versionId/annotations',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ documentId: z.string(), versionId: z.string() }),
        response: {
          200: z.object({ items: z.array(annotationSchema) }),
          403: errorBody,
          404: errorBody,
        },
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const { documentId, versionId } = request.params;
      const document = await findDocumentForUser(app.prisma, documentId, user, { capability: 'view' });
      if (!document) {
        return reply.code(404).send({ error: 'Document not found' });
      }
      const role = resolveUserDocumentRole(document, user.sub);
      if (!isDocumentVersionAccessible(role, document.versions, versionId)) {
        return reply.code(403).send({ error: 'Недостаточно прав для этой версии' });
      }
      if (!document.versions.some((v: { id: string }) => v.id === versionId)) {
        return reply.code(404).send({ error: 'Version not found' });
      }
      const items = await app.prisma.documentAnnotation.findMany({
        where: { documentId, versionId },
        orderBy: [{ page: 'asc' }, { createdAt: 'asc' }],
      });
      return {
        items: items.map((item) => serializeDocumentAnnotation(item)),
      };
    },
  );
  r.post(
    '/documents/:documentId/versions/:versionId/annotations',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ documentId: z.string(), versionId: z.string() }),
        body: createAnnotationSchema,
        response: {
          201: annotationSchema,
          403: errorBody,
          404: errorBody,
        },
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const { documentId, versionId } = request.params;
      const capability = requiredCapabilityForAnnotationKind(request.body.kind);
      const document = await findDocumentForUser(app.prisma, documentId, user, { capability });
      if (!document) {
        return reply.code(404).send({ error: 'Document not found' });
      }
      const role = resolveUserDocumentRole(document, user.sub);
      if (!isDocumentVersionAccessible(role, document.versions, versionId)) {
        return reply.code(403).send({ error: 'Недостаточно прав для этой версии' });
      }
      const version = document.versions.find((v: { id: string }) => v.id === versionId);
      if (!version || version.status === 'pending_upload') {
        return reply.code(404).send({ error: 'Version not found' });
      }
      const { pageWidthPx, pageHeightPx, x, y, contentFormat, hideOnExport, ...rest } = request.body;
      const pageAnchor =
        x != null &&
        y != null &&
        pageWidthPx != null &&
        pageHeightPx != null &&
        pageWidthPx > 0 &&
        pageHeightPx > 0
          ? { xNorm: x / pageWidthPx, yNorm: y / pageHeightPx }
          : undefined;
      const resolvedFormat = resolveCreateContentFormat(rest.kind, contentFormat);
      const meta = annotationMetaWithContentFormat(
        pageAnchor ? { pageAnchor } : undefined,
        resolvedFormat,
      );
      const created = await app.prisma.documentAnnotation.create({
        data: {
          documentId,
          versionId,
          userId: user.sub,
          page: rest.page,
          kind: rest.kind,
          content: rest.content,
          quote: rest.quote,
          x,
          y,
          hideOnExport: hideOnExport ?? false,
          ...(meta ? { meta } : {}),
        },
      });
      await app.prisma.auditLog.create({
        data: {
          action: 'document.annotation_created',
          userId: user.sub,
          tenantId: user.tenantId,
          documentId,
          meta: { annotationId: created.id, versionId, page: created.page },
        },
      });
      void publishAnnotationDocumentEvent(
        env,
        documentId,
        versionId,
        'created',
        created.id,
      ).catch((err) => {
        request.log.warn({ err }, 'annotation created event publish failed');
      });
      return reply.status(201).send(serializeDocumentAnnotation(created));
    },
  );
  r.patch(
    '/documents/:documentId/versions/:versionId/annotations/:annotationId',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({
          documentId: z.string(),
          versionId: z.string(),
          annotationId: z.string(),
        }),
        body: updateAnnotationSchema,
        response: {
          200: annotationSchema,
          404: errorBody,
          403: errorBody,
          400: errorBody,
        },
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const { documentId, versionId, annotationId } = request.params;
      const document = await findDocumentForUser(app.prisma, documentId, user, { capability: 'comment' });
      if (!document) {
        return reply.code(404).send({ error: 'Document not found' });
      }
      const role = resolveUserDocumentRole(document, user.sub);
      if (!isDocumentVersionAccessible(role, document.versions, versionId)) {
        return reply.code(403).send({ error: 'Недостаточно прав для этой версии' });
      }
      const annotation = await app.prisma.documentAnnotation.findFirst({
        where: { id: annotationId, documentId, versionId },
      });
      if (!annotation) {
        return reply.code(404).send({ error: 'Annotation not found' });
      }
      if (annotation.userId !== user.sub) {
        const editable = await findDocumentForUser(app.prisma, documentId, user, {
          capability: 'edit',
        });
        if (!editable) {
          return reply.code(403).send({ error: 'Недостаточно прав для изменения чужой заметки' });
        }
      }
      const nextQuote = request.body.quote !== undefined ? request.body.quote : annotation.quote;
      const nextContent =
        request.body.content !== undefined ? request.body.content : annotation.content;
      if (annotation.kind === 'accepted_edit' && !String(nextQuote ?? '').trim()) {
        return reply.code(400).send({ error: 'Для правки нужен исходный текст (было)' });
      }
      if (!String(nextContent).trim()) {
        return reply.code(400).send({ error: 'Текст правки не может быть пустым' });
      }
      const nextMeta =
        request.body.contentFormat !== undefined
          ? annotationMetaWithContentFormat(annotation.meta, request.body.contentFormat)
          : undefined;
      const linkedSuggestionId =
        annotation.kind === 'accepted_edit' ? linkedSuggestionIdFromMeta(annotation.meta) : null;
      const updated = await app.prisma.documentAnnotation.update({
        where: { id: annotationId },
        data: {
          page: request.body.page ?? annotation.page,
          content: nextContent,
          quote: nextQuote,
          hideOnExport: request.body.hideOnExport ?? annotation.hideOnExport,
          ...(nextMeta !== undefined ? { meta: nextMeta ?? undefined } : {}),
        },
      });
      if (linkedSuggestionId) {
        await app.prisma.aiSuggestion.updateMany({
          where: { id: linkedSuggestionId, documentId, versionId, status: 'accepted' },
          data: { originalText: String(nextQuote ?? ''), suggestion: nextContent },
        });
      }
      await app.prisma.auditLog.create({
        data: {
          action: 'document.annotation_updated',
          userId: user.sub,
          tenantId: user.tenantId,
          documentId,
          meta: { annotationId, versionId },
        },
      });
      void publishAnnotationDocumentEvent(env, documentId, versionId, 'updated', annotationId).catch(
        (err) => {
          request.log.warn({ err }, 'annotation updated event publish failed');
        },
      );
      return serializeDocumentAnnotation(updated);
    },
  );
  r.delete(
    '/documents/:documentId/versions/:versionId/annotations/:annotationId',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({
          documentId: z.string(),
          versionId: z.string(),
          annotationId: z.string(),
        }),
        response: { 204: z.null(), 404: errorBody, 403: errorBody },
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const { documentId, versionId, annotationId } = request.params;
      const document = await findDocumentForUser(app.prisma, documentId, user, { capability: 'comment' });
      if (!document) {
        return reply.code(404).send({ error: 'Document not found' });
      }
      const role = resolveUserDocumentRole(document, user.sub);
      if (!isDocumentVersionAccessible(role, document.versions, versionId)) {
        return reply.code(403).send({ error: 'Недостаточно прав для этой версии' });
      }
      const annotation = await app.prisma.documentAnnotation.findFirst({
        where: { id: annotationId, documentId, versionId },
      });
      if (!annotation) {
        return reply.code(404).send({ error: 'Annotation not found' });
      }
      if (annotation.userId !== user.sub) {
        const editable = await findDocumentForUser(app.prisma, documentId, user, {
          capability: 'edit',
        });
        if (!editable) {
          return reply.code(403).send({ error: 'Можно удалить только свою заметку' });
        }
      }
      const linkedSuggestionId =
        annotation.kind === 'accepted_edit' ? linkedSuggestionIdFromMeta(annotation.meta) : null;
      await app.prisma.documentAnnotation.delete({ where: { id: annotationId } });
      if (linkedSuggestionId) {
        await app.prisma.aiSuggestion.deleteMany({
          where: { id: linkedSuggestionId, documentId, versionId },
        });
      }
      await app.prisma.auditLog.create({
        data: {
          action: 'document.annotation_deleted',
          userId: user.sub,
          tenantId: user.tenantId,
          documentId,
          meta: { annotationId, versionId },
        },
      });
      void publishAnnotationDocumentEvent(env, documentId, versionId, 'deleted', annotationId).catch(
        (err) => {
          request.log.warn({ err }, 'annotation deleted event publish failed');
        },
      );
      return reply.status(204).send(null);
    },
  );
};
