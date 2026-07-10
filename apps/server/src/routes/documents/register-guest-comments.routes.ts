import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Env } from '../../lib/config/env.js';
import { findDocumentForUser, getAuthUser } from '../../lib/documents/document-access.js';
import { isShareLinkActive } from '../../lib/share/share-link.js';
import {
  guestShareCommentSchema,
  serializeGuestShareComment,
  updateGuestShareCommentStatusSchema,
} from '../../lib/share/guest-comment.js';
import { createMailer } from '../../lib/email/mailer.js';
import { notifyGuestCommentResolvedGuest } from '../../lib/share/notify-guest-comment.js';
import { publishGuestCommentDocumentEvent } from '../../lib/events/document-events-bus.js';
import { errorBody } from './schemas.js';

async function assertGuestCommentsDeletable(
  prisma: PrismaClient,
  documentId: string,
  versionId: string,
): Promise<void> {
  const links = await prisma.documentShareLink.findMany({
    where: { documentId, versionId },
    select: { expiresAt: true, revokedAt: true },
  });
  if (links.some((link) => isShareLinkActive(link))) {
    throw Object.assign(new Error('ACTIVE_SHARE_LINK'), { statusCode: 409 });
  }
}

export const registerGuestCommentsRoutes: FastifyPluginAsync<{ env: Env }> = async (app, { env }) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/documents/:documentId/versions/:versionId/guest-comments',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ documentId: z.string(), versionId: z.string() }),
        response: {
          200: z.object({ items: z.array(guestShareCommentSchema) }),
          404: errorBody,
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
      if (!document.versions.some((v: { id: string }) => v.id === versionId)) {
        return reply.code(404).send({ error: 'Version not found' });
      }

      const items = await app.prisma.guestShareComment.findMany({
        where: { documentId, versionId },
        orderBy: [{ page: 'asc' }, { createdAt: 'asc' }],
      });

      return {
        items: items.map(serializeGuestShareComment),
      };
    },
  );

  r.patch(
    '/documents/:documentId/guest-comments/:commentId',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({
          documentId: z.string(),
          commentId: z.string(),
        }),
        body: updateGuestShareCommentStatusSchema,
        response: {
          200: guestShareCommentSchema,
          404: errorBody,
        },
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const { documentId, commentId } = request.params;
      const document = await findDocumentForUser(app.prisma, documentId, user);
      if (!document) {
        return reply.code(404).send({ error: 'Document not found' });
      }

      const comment = await app.prisma.guestShareComment.findFirst({
        where: { id: commentId, documentId },
        select: {
          id: true,
          page: true,
          status: true,
          versionId: true,
          authorEmail: true,
          authorName: true,
          shareLink: {
            select: {
              document: { select: { id: true, title: true } },
              versionId: true,
            },
          },
        },
      });
      if (!comment) {
        return reply.code(404).send({ error: 'Comment not found' });
      }

      const resolved = request.body.status === 'resolved';
      const authorReplyText =
        resolved && request.body.authorReply?.trim()
          ? request.body.authorReply.trim()
          : null;
      const updated = await app.prisma.guestShareComment.update({
        where: { id: commentId },
        data: {
          status: request.body.status,
          resolvedAt: resolved ? new Date() : null,
          authorReply: resolved ? authorReplyText : null,
        },
      });

      await app.prisma.auditLog.create({
        data: {
          action: resolved ? 'document.guest_comment_resolved' : 'document.guest_comment_reopened',
          userId: user.sub,
          tenantId: user.tenantId,
          documentId,
          meta: { commentId, versionId: comment.versionId, page: comment.page },
        },
      });

      void publishGuestCommentDocumentEvent(env, documentId, comment.versionId, 'updated', commentId).catch(
        (err) => {
          request.log.warn({ err }, 'guest comment event publish failed');
        },
      );

      if (resolved && comment.authorEmail && authorReplyText) {
        const version = await app.prisma.documentVersion.findUnique({
          where: { id: comment.versionId },
          select: { version: true },
        });
        if (version) {
          void notifyGuestCommentResolvedGuest(
            env,
            createMailer(env, request.log),
            request.log,
            {
              guestEmail: comment.authorEmail,
              guestName: comment.authorName ?? null,
              documentId: comment.shareLink.document.id,
              documentTitle: comment.shareLink.document.title,
              versionId: comment.versionId,
              versionNumber: version.version,
              comment: {
                id: comment.id,
                page: comment.page,
                authorReply: authorReplyText,
              },
            },
          ).catch((err) => {
            request.log.warn({ err }, 'guest comment resolved notification failed');
          });
        }
      }

      return serializeGuestShareComment(updated);
    },
  );

  r.delete(
    '/documents/:documentId/guest-comments/:commentId',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({
          documentId: z.string(),
          commentId: z.string(),
        }),
        response: {
          200: z.object({ ok: z.literal(true) }),
          404: errorBody,
          409: errorBody,
        },
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const { documentId, commentId } = request.params;
      const document = await findDocumentForUser(app.prisma, documentId, user);
      if (!document) {
        return reply.code(404).send({ error: 'Document not found' });
      }

      const comment = await app.prisma.guestShareComment.findFirst({
        where: { id: commentId, documentId },
      });
      if (!comment) {
        return reply.code(404).send({ error: 'Comment not found' });
      }

      try {
        await assertGuestCommentsDeletable(app.prisma, documentId, comment.versionId);
      } catch (err) {
        if (err instanceof Error && (err as { statusCode?: number }).statusCode === 409) {
          return reply
            .code(409)
            .send({ error: 'Сначала отзовите все активные гостевые ссылки для этой версии' });
        }
        throw err;
      }

      await app.prisma.guestShareComment.delete({ where: { id: commentId } });

      void publishGuestCommentDocumentEvent(
        env,
        documentId,
        comment.versionId,
        'deleted',
        commentId,
      ).catch((err) => {
        request.log.warn({ err }, 'guest comment event publish failed');
      });

      await app.prisma.auditLog.create({
        data: {
          action: 'document.guest_comment_deleted',
          userId: user.sub,
          tenantId: user.tenantId,
          documentId,
          meta: { commentId, versionId: comment.versionId, page: comment.page },
        },
      });

      return { ok: true as const };
    },
  );

  r.delete(
    '/documents/:documentId/versions/:versionId/guest-comments',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ documentId: z.string(), versionId: z.string() }),
        response: {
          200: z.object({ ok: z.literal(true), deleted: z.number().int().nonnegative() }),
          404: errorBody,
          409: errorBody,
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
      if (!document.versions.some((v: { id: string }) => v.id === versionId)) {
        return reply.code(404).send({ error: 'Version not found' });
      }

      try {
        await assertGuestCommentsDeletable(app.prisma, documentId, versionId);
      } catch (err) {
        if (err instanceof Error && (err as { statusCode?: number }).statusCode === 409) {
          return reply
            .code(409)
            .send({ error: 'Сначала отзовите все активные гостевые ссылки для этой версии' });
        }
        throw err;
      }

      const result = await app.prisma.guestShareComment.deleteMany({
        where: { documentId, versionId },
      });

      if (result.count > 0) {
        void publishGuestCommentDocumentEvent(env, documentId, versionId, 'cleared').catch((err) => {
          request.log.warn({ err }, 'guest comment event publish failed');
        });

        await app.prisma.auditLog.create({
          data: {
            action: 'document.guest_comments_cleared',
            userId: user.sub,
            tenantId: user.tenantId,
            documentId,
            meta: { versionId, deleted: result.count },
          },
        });
      }

      return { ok: true as const, deleted: result.count };
    },
  );
};
