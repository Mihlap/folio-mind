import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { PrismaClient } from '@prisma/client';
import {
  DOCUMENT_MEMBER_ROLES,
  isDocumentMemberRole,
  type DocumentMemberRole,
} from '@folio-mind/pdf-contracts';
import { getAuthUser, findDocumentForUser } from '../lib/documents/document-access.js';
import { deleteDocumentWithArtifacts } from '../lib/documents/delete-document.js';
import type { Env } from '../lib/config/env.js';
import { findProjectForTenant } from '../lib/projects/project-access.js';
import { normalizeEmail } from '../lib/email/email.js';
import { mapDocumentListItem } from './documents/helpers.js';
import { toDocumentReviewStatus } from '../lib/documents/document-review-status.js';
import { documentSchema, errorBody } from './documents/schemas.js';

const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  documentCount: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const projectMemberRoleSchema = z.enum(DOCUMENT_MEMBER_ROLES);

const projectMemberSchema = z.object({
  userId: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  role: projectMemberRoleSchema,
  createdAt: z.string(),
});

const projectOwnerSchema = z.object({
  userId: z.string(),
  email: z.string(),
  name: z.string().nullable(),
});

export const projectRoutes: FastifyPluginAsync<{ env: Env }> = async (app, { env }) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/projects',
    {
      preHandler: [app.authenticate],
      schema: {
        response: {
          200: z.object({ items: z.array(projectSchema) }),
        },
      },
    },
    async (request) => {
      const user = getAuthUser(request);
      const items = await app.prisma.project.findMany({
        where: { tenantId: user.tenantId },
        orderBy: { updatedAt: 'desc' },
        include: { _count: { select: { documents: true } } },
      });
      return {
        items: items.map((p) => ({
          id: p.id,
          name: p.name,
          documentCount: p._count.documents,
          createdAt: p.createdAt.toISOString(),
          updatedAt: p.updatedAt.toISOString(),
        })),
      };
    },
  );

  r.post(
    '/projects',
    {
      preHandler: [app.authenticate],
      schema: {
        body: z.object({ name: z.string().trim().min(1).max(120) }),
        response: {
          201: projectSchema,
          400: errorBody,
        },
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const { name } = request.body;
      const project = await app.prisma.project.create({
        data: {
          name,
          tenantId: user.tenantId,
          ownerId: user.sub,
        },
        include: { _count: { select: { documents: true } } },
      });
      await app.prisma.auditLog.create({
        data: {
          action: 'project.create',
          userId: user.sub,
          tenantId: user.tenantId,
          meta: { projectId: project.id, name },
        },
      });
      return reply.status(201).send({
        id: project.id,
        name: project.name,
        documentCount: project._count.documents,
        createdAt: project.createdAt.toISOString(),
        updatedAt: project.updatedAt.toISOString(),
      });
    },
  );

  r.get(
    '/projects/:projectId',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ projectId: z.string() }),
        response: {
          200: z.object({
            project: projectSchema,
            documents: z.array(documentSchema),
          }),
          404: errorBody,
        },
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const project = await app.prisma.project.findFirst({
        where: { id: request.params.projectId, tenantId: user.tenantId },
        include: {
          _count: { select: { documents: true } },
          documents: {
            orderBy: { updatedAt: 'desc' },
            take: 100,
            include: {
              project: { select: { name: true } },
              versions: { orderBy: { version: 'desc' }, take: 1 },
            },
          },
        },
      });
      if (!project) {
        return reply.code(404).send({ error: 'Project not found' });
      }
      return {
        project: {
          id: project.id,
          name: project.name,
          documentCount: project._count.documents,
          createdAt: project.createdAt.toISOString(),
          updatedAt: project.updatedAt.toISOString(),
        },
        documents: project.documents.map((doc) =>
          mapDocumentListItem(doc, toDocumentReviewStatus),
        ),
      };
    },
  );

  r.patch(
    '/projects/:projectId',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ projectId: z.string() }),
        body: z.object({ name: z.string().trim().min(1).max(120) }),
        response: {
          200: projectSchema,
          404: errorBody,
        },
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const existing = await findProjectForTenant(
        app.prisma,
        request.params.projectId,
        user.tenantId,
      );
      if (!existing) {
        return reply.code(404).send({ error: 'Project not found' });
      }
      const project = await app.prisma.project.update({
        where: { id: existing.id },
        data: { name: request.body.name },
        include: { _count: { select: { documents: true } } },
      });
      return {
        id: project.id,
        name: project.name,
        documentCount: project._count.documents,
        createdAt: project.createdAt.toISOString(),
        updatedAt: project.updatedAt.toISOString(),
      };
    },
  );

  r.delete(
    '/projects/:projectId',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ projectId: z.string() }),
        response: {
          204: z.void(),
          403: errorBody,
          404: errorBody,
        },
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const existing = await findProjectForTenant(
        app.prisma,
        request.params.projectId,
        user.tenantId,
      );
      if (!existing) {
        return reply.code(404).send({ error: 'Project not found' });
      }

      const documents = await app.prisma.document.findMany({
        where: { projectId: existing.id, tenantId: user.tenantId },
        include: {
          versions: {
            orderBy: { version: 'asc' },
            select: { id: true, s3Key: true, sourceDocxKey: true, version: true },
          },
        },
      });

      for (const document of documents) {
        const manageable = await findDocumentForUser(app.prisma, document.id, user, {
          capability: 'manage',
        });
        if (!manageable) {
          return reply.code(403).send({
            error:
              'Нельзя удалить проект: в нём есть документы, которые вы не можете удалить. Отвяжите их от проекта («Без проекта») или попросите владельца удалить документы.',
          });
        }
      }

      for (const document of documents) {
        await deleteDocumentWithArtifacts(app.prisma, env, document, request.log);
        await app.prisma.auditLog.create({
          data: {
            action: 'document.delete',
            userId: user.sub,
            tenantId: user.tenantId,
            meta: {
              documentId: document.id,
              title: document.title,
              viaProjectDelete: existing.id,
            },
          },
        });
      }

      await app.prisma.project.delete({ where: { id: existing.id } });
      await app.prisma.auditLog.create({
        data: {
          action: 'project.delete',
          userId: user.sub,
          tenantId: user.tenantId,
          meta: {
            projectId: existing.id,
            name: existing.name,
            deletedDocumentCount: documents.length,
            deletedDocumentIds: documents.map((document) => document.id),
          },
        },
      });
      return reply.code(204).send();
    },
  );

  r.get(
    '/projects/:projectId/members',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ projectId: z.string() }),
        response: {
          200: z.object({
            projectId: z.string(),
            myRole: projectMemberRoleSchema.nullable(),
            canManage: z.boolean(),
            owner: projectOwnerSchema.nullable(),
            members: z.array(projectMemberSchema),
          }),
          403: errorBody,
          404: errorBody,
        },
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const project = await findProjectForTenant(
        app.prisma,
        request.params.projectId,
        user.tenantId,
      );
      if (!project) {
        return reply.code(404).send({ error: 'Project not found' });
      }
      const access = await resolveProjectMemberManageAccess(app.prisma, project, user);
      if (!access.canManage) {
        return reply.code(403).send({
          error: 'Недостаточно прав для управления доступом проекта',
        });
      }
      const owner = await app.prisma.user.findUnique({
        where: { id: project.ownerId },
        select: { id: true, email: true, name: true },
      });
      const members = await app.prisma.projectMember.findMany({
        where: { projectId: project.id },
        include: { user: { select: { id: true, email: true, name: true } } },
        orderBy: { createdAt: 'asc' },
      });
      return {
        projectId: project.id,
        myRole: access.myRole,
        canManage: true,
        owner: owner
          ? { userId: owner.id, email: owner.email, name: owner.name }
          : null,
        members: members.map((m) => ({
          userId: m.userId,
          email: m.user.email,
          name: m.user.name,
          role: m.role as z.infer<typeof projectMemberRoleSchema>,
          createdAt: m.createdAt.toISOString(),
        })),
      };
    },
  );

  r.post(
    '/projects/:projectId/members',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ projectId: z.string() }),
        body: z.object({
          email: z.string().email(),
          role: projectMemberRoleSchema,
        }),
        response: {
          201: projectMemberSchema,
          400: errorBody,
          403: errorBody,
          404: errorBody,
        },
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const project = await findProjectForTenant(
        app.prisma,
        request.params.projectId,
        user.tenantId,
      );
      if (!project) {
        return reply.code(404).send({ error: 'Project not found' });
      }
      const access = await resolveProjectMemberManageAccess(app.prisma, project, user);
      if (!access.canManage) {
        return reply.code(403).send({
          error: 'Недостаточно прав для управления доступом проекта',
        });
      }

      const email = normalizeEmail(request.body.email);
      const targetUser = await app.prisma.user.findUnique({ where: { email } });
      if (!targetUser) {
        return reply.code(400).send({
          error:
            'Пользователь с таким email ещё не в вашем рабочем пространстве. Отправьте ссылку для присоединения.',
          code: 'USER_NOT_IN_TENANT',
        });
      }
      if (targetUser.tenantId !== user.tenantId) {
        return reply.code(400).send({
          error:
            'Этот email уже зарегистрирован в другом рабочем пространстве. Отправьте ссылку для присоединения — коллега войдёт и попадёт к вам.',
          code: 'USER_IN_OTHER_TENANT',
        });
      }
      if (targetUser.id === project.ownerId) {
        return reply.code(400).send({ error: 'Владелец уже имеет полный доступ к проекту' });
      }
      if (targetUser.id === user.sub && project.ownerId !== user.sub) {
        return reply.code(403).send({ error: 'Нельзя изменить свою роль через этот интерфейс' });
      }

      const member = await app.prisma.projectMember.upsert({
        where: {
          projectId_userId: { projectId: project.id, userId: targetUser.id },
        },
        create: {
          projectId: project.id,
          userId: targetUser.id,
          role: request.body.role,
        },
        update: { role: request.body.role },
        include: { user: { select: { id: true, email: true, name: true } } },
      });

      await app.prisma.auditLog.create({
        data: {
          action: 'project.member_upsert',
          userId: user.sub,
          tenantId: user.tenantId,
          meta: { projectId: project.id, memberUserId: member.userId, role: member.role },
        },
      });

      return reply.code(201).send({
        userId: member.userId,
        email: member.user.email,
        name: member.user.name,
        role: member.role as z.infer<typeof projectMemberRoleSchema>,
        createdAt: member.createdAt.toISOString(),
      });
    },
  );

  r.patch(
    '/projects/:projectId/members/:userId',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ projectId: z.string(), userId: z.string() }),
        body: z.object({ role: projectMemberRoleSchema }),
        response: {
          200: projectMemberSchema,
          400: errorBody,
          403: errorBody,
          404: errorBody,
        },
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const project = await findProjectForTenant(
        app.prisma,
        request.params.projectId,
        user.tenantId,
      );
      if (!project) {
        return reply.code(404).send({ error: 'Project not found' });
      }
      const access = await resolveProjectMemberManageAccess(app.prisma, project, user);
      if (!access.canManage) {
        return reply.code(403).send({
          error: 'Недостаточно прав для управления доступом проекта',
        });
      }
      const member = await app.prisma.projectMember.findUnique({
        where: {
          projectId_userId: {
            projectId: project.id,
            userId: request.params.userId,
          },
        },
        include: { user: { select: { id: true, email: true, name: true } } },
      });
      if (!member) {
        return reply.code(404).send({ error: 'Проект не найден или участник вышел из него' });
      }
      if (member.userId === user.sub && project.ownerId !== user.sub) {
        return reply.code(403).send({ error: 'Нельзя изменить свою роль через этот интерфейс' });
      }
      const updated = await app.prisma.projectMember.update({
        where: {
          projectId_userId: { projectId: project.id, userId: member.userId },
        },
        data: { role: request.body.role },
        include: { user: { select: { id: true, email: true, name: true } } },
      });
      await app.prisma.auditLog.create({
        data: {
          action: 'project.member_role_change',
          userId: user.sub,
          tenantId: user.tenantId,
          meta: {
            projectId: project.id,
            memberUserId: updated.userId,
            role: updated.role,
          },
        },
      });
      return {
        userId: updated.userId,
        email: updated.user.email,
        name: updated.user.name,
        role: updated.role as z.infer<typeof projectMemberRoleSchema>,
        createdAt: updated.createdAt.toISOString(),
      };
    },
  );

  r.delete(
    '/projects/:projectId/members/:userId',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ projectId: z.string(), userId: z.string() }),
        response: {
          204: z.void(),
          403: errorBody,
          404: errorBody,
        },
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const project = await findProjectForTenant(
        app.prisma,
        request.params.projectId,
        user.tenantId,
      );
      if (!project) {
        return reply.code(404).send({ error: 'Project not found' });
      }
      const access = await resolveProjectMemberManageAccess(app.prisma, project, user);
      if (!access.canManage) {
        return reply.code(403).send({
          error: 'Недостаточно прав для управления доступом проекта',
        });
      }
      const member = await app.prisma.projectMember.findUnique({
        where: {
          projectId_userId: {
            projectId: project.id,
            userId: request.params.userId,
          },
        },
        select: { userId: true },
      });
      if (!member) {
        return reply.code(404).send({ error: 'Участник не найден' });
      }
      await app.prisma.projectMember.delete({
        where: {
          projectId_userId: { projectId: project.id, userId: member.userId },
        },
      });
      await app.prisma.auditLog.create({
        data: {
          action: 'project.member_delete',
          userId: user.sub,
          tenantId: user.tenantId,
          meta: { projectId: project.id, memberUserId: member.userId },
        },
      });
      return reply.code(204).send();
    },
  );
};

async function resolveProjectMemberManageAccess(
  prisma: Pick<PrismaClient, 'projectMember' | 'document'>,
  project: { id: string; ownerId: string; tenantId: string },
  user: { sub: string },
): Promise<{ canManage: boolean; myRole: DocumentMemberRole | null }> {
  const myMember = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: project.id, userId: user.sub } },
    select: { role: true },
  });
  const ownsAnyDocument = await prisma.document.findFirst({
    where: { projectId: project.id, tenantId: project.tenantId, ownerId: user.sub },
    select: { id: true },
  });
  const canManage = project.ownerId === user.sub || Boolean(ownsAnyDocument);
  const myRole =
    myMember && isDocumentMemberRole(myMember.role) ? myMember.role : null;
  return { canManage, myRole };
}
