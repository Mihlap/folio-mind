import type { PrismaClient } from '@prisma/client';
import { deleteCachedSummaries } from '../ai/ai-cache.js';
import type { Env } from '../config/env.js';
import {
  deleteDocumentArtifacts,
  isS3Configured,
  type S3DeleteResult,
} from '../storage/s3.js';

type DocumentVersionRow = {
  id: string;
  s3Key: string;
  sourceDocxKey: string | null;
  version: number;
};

type DocumentDeleteRow = {
  id: string;
  title: string;
  versions: DocumentVersionRow[];
};

type Logger = {
  warn: (obj: unknown, msg?: string) => void;
  info?: (obj: unknown, msg?: string) => void;
};

function logS3CleanupIssues(
  log: Logger | undefined,
  result: S3DeleteResult,
  context: Record<string, unknown>,
  message: string,
): void {
  if (!log || result.failed.length === 0) {
    log?.info?.(
      { ...context, s3DeleteOk: result.deleted.length },
      'S3 cleanup completed for deleted document',
    );
    return;
  }
  log.warn({ ...context, s3DeleteFailed: result.failed, s3DeleteOk: result.deleted }, message);
}

export async function deleteDocumentWithArtifacts(
  prisma: PrismaClient,
  env: Env,
  document: DocumentDeleteRow,
  log?: Logger,
): Promise<void> {
  const versionIds = document.versions.map((version) => version.id);
  if (isS3Configured()) {
    const result = await deleteDocumentArtifacts(
      document.id,
      document.versions.map((version) => ({
        versionId: version.id,
        s3Key: version.s3Key,
        sourceDocxKey: version.sourceDocxKey,
        versionNumber: version.version,
      })),
    );
    logS3CleanupIssues(
      log,
      result,
      { documentId: document.id },
      'S3 cleanup incomplete for deleted document',
    );
  }
  if (versionIds.length > 0) {
    await prisma.documentVersion.updateMany({
      where: { sourceVersionId: { in: versionIds } },
      data: { sourceVersionId: null },
    });
  }
  await deleteCachedSummaries(env, versionIds);
  await prisma.documentAnnotation.deleteMany({ where: { documentId: document.id } });
  await prisma.aiSuggestion.deleteMany({ where: { documentId: document.id } });
  await prisma.document.delete({ where: { id: document.id } });
}
