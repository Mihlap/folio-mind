import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { DOCUMENT_REVIEW_STATUSES } from '@folio-mind/pdf-contracts';
import type { Env } from '../../lib/config/env.js';
import { findDocumentForUser, getAuthUser } from '../../lib/documents/document-access.js';
import { toDocumentReviewStatus } from '../../lib/documents/document-review-status.js';
import { publishReviewStatusDocumentEvent } from '../../lib/events/document-events-bus.js';
import { errorBody } from './schemas.js';

const reviewStatusSchema = z.enum(DOCUMENT_REVIEW_STATUSES);

export const registerReviewStatusRoutes: FastifyPluginAsync<{ env: Env }> = async (app, { env }) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.patch(
    '/documents/:documentId/review-status',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ documentId: z.string() }),
        body: z.object({ reviewStatus: reviewStatusSchema }),
        response: {
          200: z.object({
            id: z.string(),
            reviewStatus: reviewStatusSchema,
            reviewStatusChangedAt: z.string().nullable(),
          }),
          404: errorBody,
        },
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const document = await findDocumentForUser(app.prisma, request.params.documentId, user, {
        capability: 'manage_share',
      });
      if (!document) {
        return reply.code(404).send({ error: 'Document not found' });
      }

      const { reviewStatus } = request.body;
      const previousStatus = toDocumentReviewStatus(document.reviewStatus);

      if (previousStatus === reviewStatus) {
        return {
          id: document.id,
          reviewStatus,
          reviewStatusChangedAt: document.reviewStatusChangedAt?.toISOString() ?? null,
        };
      }

      const changedAt = new Date();
      const updated = await app.prisma.document.update({
        where: { id: document.id },
        data: {
          reviewStatus,
          reviewStatusChangedAt: changedAt,
        },
      });

      await app.prisma.auditLog.create({
        data: {
          action: 'document.review_status_change',
          userId: user.sub,
          tenantId: user.tenantId,
          documentId: document.id,
          meta: {
            from: previousStatus,
            to: reviewStatus,
          },
        },
      });

      void publishReviewStatusDocumentEvent(env, document.id, reviewStatus).catch((err) => {
        request.log.warn({ err }, 'review status event publish failed');
      });

      return {
        id: updated.id,
        reviewStatus: toDocumentReviewStatus(updated.reviewStatus),
        reviewStatusChangedAt: updated.reviewStatusChangedAt?.toISOString() ?? null,
      };
    },
  );
};
