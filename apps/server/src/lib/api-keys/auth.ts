import { createHash, randomBytes } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';

export function hashApiKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export function generateApiKey(): string {
  return `fm_${randomBytes(24).toString('base64url')}`;
}

export async function authenticateApiKey(
  prisma: PrismaClient,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<{ tenantId: string; scopes: string[] } | null> {
  const header = request.headers.authorization;
  const raw =
    header?.startsWith('Bearer fm_') ? header.slice(7) : (request.headers['x-api-key'] as string | undefined);
  if (!raw?.startsWith('fm_')) {
    reply.code(401).send({ error: 'API key required' });
    return null;
  }
  const keyHash = hashApiKey(raw);
  const row = await prisma.apiKey.findFirst({
    where: { keyHash, revokedAt: null },
  });
  if (!row) {
    reply.code(401).send({ error: 'Invalid API key' });
    return null;
  }
  void prisma.apiKey.update({
    where: { id: row.id },
    data: { lastUsedAt: new Date() },
  });
  return { tenantId: row.tenantId, scopes: row.scopes };
}
