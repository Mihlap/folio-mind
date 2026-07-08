export type OperationSaveMode = 'new_version' | 'replace_current';

type VersionRow = {
  id: string;
  version: number;
  s3Key: string;
  mimeType: string;
};

export function validateReplaceCurrentAllowed(
  latestVersion: VersionRow | undefined,
  sourceVersionId: string,
): string | null {
  if (!latestVersion || latestVersion.id !== sourceVersionId) {
    return 'Заменить можно только текущую (последнюю) версию документа';
  }
  return null;
}

export function resolveNewVersionTarget(
  documentVersions: VersionRow[],
  sourceVersion: VersionRow,
  targetS3Key: string,
) {
  const nextVersionNumber = (documentVersions[0]?.version ?? 0) + 1;
  return {
    replaceInPlace: false as const,
    targetVersionId: null as string | null,
    targetVersionNumber: nextVersionNumber,
    targetS3Key,
    createVersionData: {
      version: nextVersionNumber,
      s3Key: targetS3Key,
      size: BigInt(0),
      mimeType: sourceVersion.mimeType,
      status: 'processing' as const,
      sourceVersionId: sourceVersion.id,
    },
  };
}

export function resolveReplaceCurrentTarget(sourceVersion: VersionRow) {
  return {
    replaceInPlace: true as const,
    targetVersionId: sourceVersion.id,
    targetVersionNumber: sourceVersion.version,
    targetS3Key: sourceVersion.s3Key,
    createVersionData: null,
  };
}
