import type { PrismaClient } from '@prisma/client';
import { getRootVersionFromChain, getVersionChain } from '@folio-mind/pdf-contracts';
type VersionRow = {
  id: string;
  sourceVersionId: string | null;
  s3Key: string;
  sourceDocxKey: string | null;
};
export async function resolveEditSourceVersionId(
  prisma: PrismaClient,
  documentId: string,
  startVersionId: string,
): Promise<string> {
  let currentId: string | null = startVersionId;
  const visited = new Set<string>();
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const [ai, manual] = await Promise.all([
      prisma.aiSuggestion.count({
        where: { documentId, versionId: currentId, status: 'accepted' },
      }),
      prisma.documentAnnotation.count({
        where: { documentId, versionId: currentId, kind: 'accepted_edit' },
      }),
    ]);
    if (ai > 0 || manual > 0) return currentId;
    const parentVersion: {
      sourceVersionId: string | null;
    } | null = await prisma.documentVersion.findUnique({
      where: { id: currentId },
      select: { sourceVersionId: true },
    });
    currentId = parentVersion?.sourceVersionId ?? null;
  }
  return startVersionId;
}
export function resolveRootVersion(versions: VersionRow[], startVersionId: string): VersionRow {
  const chain = getVersionChain(versions, startVersionId);
  const root = getRootVersionFromChain(chain);
  const fallback = versions.find((row) => row.id === startVersionId);
  if (!root && !fallback) {
    throw new Error(`Version not found: ${startVersionId}`);
  }
  return root ?? fallback!;
}
