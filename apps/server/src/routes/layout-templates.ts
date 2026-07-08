import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { BUILTIN_LAYOUT_TEMPLATES } from '@folio-mind/pdf-contracts';
import { getAuthUser } from '../lib/documents/document-access.js';

const categorySchema = z.enum(['cover', 'spread', 'three-renders', 'custom']);

const templateItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  category: categorySchema,
  objects: z.array(z.unknown()),
  builtin: z.boolean().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

const errorBody = z.object({ error: z.string() });

export const layoutTemplateRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/layout-templates',
    {
      preHandler: [app.authenticate],
      schema: {
        response: {
          200: z.object({ items: z.array(templateItemSchema) }),
        },
      },
    },
    async (request) => {
      const user = getAuthUser(request);
      const tenantItems = await app.prisma.layoutTemplate.findMany({
        where: { tenantId: user.tenantId },
        orderBy: { updatedAt: 'desc' },
      });

      const builtin = BUILTIN_LAYOUT_TEMPLATES.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        category: item.category,
        objects: item.objects,
        builtin: true,
      }));

      const custom = tenantItems.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        category: categorySchema.parse(item.category),
        objects: item.objects as unknown[],
        builtin: false,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      }));

      return { items: [...builtin, ...custom] };
    },
  );

  r.post(
    '/layout-templates',
    {
      preHandler: [app.authenticate],
      schema: {
        body: z.object({
          name: z.string().trim().min(1).max(120),
          description: z.string().trim().max(500).optional(),
          category: categorySchema.default('custom'),
          objects: z.array(z.unknown()).min(1).max(80),
        }),
        response: {
          201: templateItemSchema,
          400: errorBody,
        },
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const { name, description, category, objects } = request.body;
      const created = await app.prisma.layoutTemplate.create({
        data: {
          name,
          description: description?.trim() || null,
          category,
          objects: objects as Prisma.InputJsonValue,
          tenantId: user.tenantId,
        },
      });
      await app.prisma.auditLog.create({
        data: {
          action: 'layout_template.create',
          userId: user.sub,
          tenantId: user.tenantId,
          meta: { templateId: created.id, name },
        },
      });
      return reply.status(201).send({
        id: created.id,
        name: created.name,
        description: created.description,
        category: categorySchema.parse(created.category),
        objects: created.objects as unknown[],
        builtin: false,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      });
    },
  );

  r.patch(
    '/layout-templates/:templateId',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ templateId: z.string() }),
        body: z.object({
          name: z.string().trim().min(1).max(120).optional(),
          description: z.string().trim().max(500).nullable().optional(),
          category: categorySchema.optional(),
          objects: z.array(z.unknown()).min(1).max(80).optional(),
        }),
        response: {
          200: templateItemSchema,
          404: errorBody,
        },
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const { templateId } = request.params;
      const existing = await app.prisma.layoutTemplate.findFirst({
        where: { id: templateId, tenantId: user.tenantId },
      });
      if (!existing) {
        return reply.status(404).send({ error: 'Шаблон не найден' });
      }
      const updated = await app.prisma.layoutTemplate.update({
        where: { id: templateId },
        data: {
          ...(request.body.name !== undefined ? { name: request.body.name } : {}),
          ...(request.body.description !== undefined
            ? { description: request.body.description }
            : {}),
          ...(request.body.category !== undefined ? { category: request.body.category } : {}),
          ...(request.body.objects !== undefined
            ? { objects: request.body.objects as Prisma.InputJsonValue }
            : {}),
        },
      });
      return {
        id: updated.id,
        name: updated.name,
        description: updated.description,
        category: categorySchema.parse(updated.category),
        objects: updated.objects as unknown[],
        builtin: false,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      };
    },
  );

  r.delete(
    '/layout-templates/:templateId',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ templateId: z.string() }),
        response: {
          204: z.void(),
          404: errorBody,
        },
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const { templateId } = request.params;
      const existing = await app.prisma.layoutTemplate.findFirst({
        where: { id: templateId, tenantId: user.tenantId },
      });
      if (!existing) {
        return reply.status(404).send({ error: 'Шаблон не найден' });
      }
      await app.prisma.layoutTemplate.delete({ where: { id: templateId } });
      await app.prisma.auditLog.create({
        data: {
          action: 'layout_template.delete',
          userId: user.sub,
          tenantId: user.tenantId,
          meta: { templateId, name: existing.name },
        },
      });
      return reply.status(204).send();
    },
  );
};
