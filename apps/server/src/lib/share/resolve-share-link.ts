import type { PrismaClient } from '@prisma/client';
import { hashShareToken, isShareLinkActive } from '../share/share-link.js';

export type ResolvedShareLink = {
  link: {
    id: string;
    documentId: string;
    versionId: string;
    allowDownload: boolean;
    expiresAt: Date;
  };
  document: {
    id: string;
    title: string;
    tenantId: string;
  };
  version: {
    id: string;
    version: number;
    status: string;
    pageCount: number | null;
    s3Key: string;
  };
};

export async function resolveShareLinkByToken(
  prisma: PrismaClient,
  token: string,
): Promise<ResolvedShareLink | null> {
  const tokenHash = hashShareToken(token);
  const link = await prisma.documentShareLink.findUnique({
    where: { tokenHash },
    include: {
      document: {
        include: {
          versions: true,
        },
      },
    },
  });

  if (!link || !isShareLinkActive(link)) {
    return null;
  }

  const version = link.document.versions.find((v) => v.id === link.versionId);
  if (!version || version.status === 'pending_upload') {
    return null;
  }

  return {
    link: {
      id: link.id,
      documentId: link.documentId,
      versionId: link.versionId,
      allowDownload: link.allowDownload,
      expiresAt: link.expiresAt,
    },
    document: {
      id: link.document.id,
      title: link.document.title,
      tenantId: link.document.tenantId,
    },
    version: {
      id: version.id,
      version: version.version,
      status: version.status,
      pageCount: version.pageCount,
      s3Key: version.s3Key,
    },
  };
}
