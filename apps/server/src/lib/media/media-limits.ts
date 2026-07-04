import type { Env } from '../config/env.js';
import {
  MEDIA_MAX_FILE_BYTES,
  MEDIA_MAX_PIXEL_SIDE,
  MEDIA_STORE_MAX_PIXEL_SIDE,
  MEDIA_TENANT_QUOTA_BYTES_DEFAULT,
  formatBytesShort,
  type MediaQuotaInfo,
} from '@folio-mind/pdf-contracts';
import type { PrismaClient } from '@prisma/client';

export function mediaMaxFileBytes(env: Env): number {
  return env.MEDIA_MAX_FILE_BYTES ?? MEDIA_MAX_FILE_BYTES;
}

export function mediaTenantQuotaBytes(env: Env): number {
  return env.MEDIA_TENANT_QUOTA_BYTES ?? MEDIA_TENANT_QUOTA_BYTES_DEFAULT;
}

export function mediaMaxPixelSide(env: Env): number {
  return env.MEDIA_MAX_PIXEL_SIDE ?? MEDIA_MAX_PIXEL_SIDE;
}

export async function getMediaTenantUsage(
  prisma: PrismaClient,
  tenantId: string,
): Promise<{ usedBytes: bigint; fileCount: number }> {
  const agg = await prisma.mediaAsset.aggregate({
    where: {
      tenantId,
      status: { in: ['ready', 'pending_upload'] },
    },
    _sum: { size: true },
    _count: true,
  });
  return {
    usedBytes: agg._sum.size ?? BigInt(0),
    fileCount: agg._count,
  };
}

export function buildMediaQuotaInfo(
  env: Env,
  usedBytes: bigint,
  fileCount: number,
): MediaQuotaInfo {
  return {
    usedBytes: usedBytes.toString(),
    limitBytes: mediaTenantQuotaBytes(env).toString(),
    fileCount,
    maxFileBytes: mediaMaxFileBytes(env).toString(),
    maxPixelSide: mediaMaxPixelSide(env),
    storeMaxPixelSide: MEDIA_STORE_MAX_PIXEL_SIDE,
  };
}

export async function assertMediaUploadAllowed(
  prisma: PrismaClient,
  env: Env,
  tenantId: string,
  fileSize: number,
  width?: number | null,
  height?: number | null,
): Promise<void> {
  const maxFile = mediaMaxFileBytes(env);
  if (fileSize > maxFile) {
    throw new MediaLimitError(
      `Файл слишком большой (макс. ${formatBytesShort(maxFile)} для медиатеки)`,
    );
  }

  const maxPx = mediaMaxPixelSide(env);
  const longest = Math.max(width ?? 0, height ?? 0);
  if (longest > maxPx) {
    throw new MediaLimitError(
      `Изображение слишком большое (${longest}px по длинной стороне, макс. ${maxPx}px). Уменьшите перед загрузкой.`,
    );
  }

  const quota = mediaTenantQuotaBytes(env);
  const { usedBytes } = await getMediaTenantUsage(prisma, tenantId);
  if (usedBytes + BigInt(fileSize) > BigInt(quota)) {
    throw new MediaLimitError(
      `Квота медиатеки исчерпана (использовано ${formatBytesShort(Number(usedBytes))} из ${formatBytesShort(quota)}). Удалите файлы или обратитесь к администратору.`,
    );
  }
}

export class MediaLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MediaLimitError';
  }
}
