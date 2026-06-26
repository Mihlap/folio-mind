import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { isUserUploadedSourceDocxKey } from '@folio-mind/pdf-contracts';
import type { Env } from '../../lib/config/env.js';
import { getAuthUser } from '../../lib/documents/document-access.js';
import { enqueuePreConvertJob, enqueuePreviewJob } from '../../lib/queue/queue.js';
import { isS3Configured, resolveS3Key, s3ObjectExists } from '../../lib/storage/s3.js';
export function buildOriginalKey(documentId: string, version: number, fileName: string) {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return resolveS3Key('originals', `${documentId}/v${version}-${safeName}`);
}
export async function finalizeDocumentUpload(params: {
  prisma: PrismaClient;
  env: Env;
  user: ReturnType<typeof getAuthUser>;
  documentId: string;
  versionId: string;
  version: {
    s3Key: string;
    sha256: string | null;
    sourceDocxKey?: string | null;
  };
  sha256?: string;
  requestId?: string;
}): Promise<{
  versionId: string;
  status: string;
  jobId: string;
}> {
  const { prisma, env, user, documentId, versionId, version, sha256, requestId } = params;
  if (!version.s3Key || version.s3Key === 'pending') {
    throw new Error('Версия не привязана к файлу в хранилище');
  }
  if (isS3Configured() && !(await s3ObjectExists(version.s3Key))) {
    throw new Error('Файл не найден в хранилище — повторите загрузку');
  }
  const job = await prisma.job.create({
    data: {
      type: 'preview',
      status: 'queued',
      tenantId: user.tenantId,
      payload: { documentId, versionId, s3Key: version.s3Key },
    },
  });
  await prisma.documentVersion.update({
    where: { id: versionId },
    data: {
      status: 'processing',
      sha256: sha256 ?? version.sha256,
    },
  });
  await enqueuePreviewJob(env, {
    jobId: job.id,
    documentId,
    versionId,
    tenantId: user.tenantId,
    s3Key: version.s3Key,
    requestId,
  });
  if (!isUserUploadedSourceDocxKey(version.sourceDocxKey)) {
    const preConvertJob = await prisma.job.create({
      data: {
        type: 'pre-convert-pdf',
        status: 'queued',
        tenantId: user.tenantId,
        payload: { documentId, versionId, s3Key: version.s3Key },
      },
    });
    await enqueuePreConvertJob(env, {
      jobId: preConvertJob.id,
      documentId,
      versionId,
      tenantId: user.tenantId,
      s3Key: version.s3Key,
      requestId,
    });
  }
  await prisma.auditLog.create({
    data: {
      action: 'document.upload_complete',
      userId: user.sub,
      tenantId: user.tenantId,
      documentId,
      meta: { versionId, jobId: job.id },
    },
  });
  return { versionId, status: 'processing', jobId: job.id };
}
export function encodeCursor(updatedAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ updatedAt: updatedAt.toISOString(), id }), 'utf8').toString(
    'base64url',
  );
}
export function decodeCursor(cursor: string): {
  updatedAt: Date;
  id: string;
} | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
      updatedAt: string;
      id: string;
    };
    return { updatedAt: new Date(parsed.updatedAt), id: parsed.id };
  } catch {
    return null;
  }
}
export async function clearVersionLineageRefs(
  prisma: PrismaClient,
  versionIds: string[],
): Promise<void> {
  if (versionIds.length === 0) return;
  await prisma.documentVersion.updateMany({
    where: { sourceVersionId: { in: versionIds } },
    data: { sourceVersionId: null },
  });
}
export function hashBuffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}
