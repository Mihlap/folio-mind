import { createCanvas, loadImage } from '@napi-rs/canvas';
import type { WorkerJobPayload } from '../../lib/config/job-types.js';
import { getPrisma } from '../../lib/infra/prisma.js';
import {
  getObjectBuffer,
  isWorkerS3Configured,
  putObjectBuffer,
  deleteObjectByKey,
} from '../../lib/storage/s3.js';

const STORE_MAX_SIDE = 4096;
const WEBP_QUALITY = 82;

type MediaOptimizePayload = WorkerJobPayload & {
  mediaAssetId?: string;
  tenantId?: string;
  s3Key?: string;
};

async function resizeToBuffer(
  source: Buffer,
  maxSide: number,
  mime: 'image/jpeg' | 'image/webp',
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const img = await loadImage(source);
  const longest = Math.max(img.width, img.height);
  const scale = longest > maxSide ? maxSide / longest : 1;
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, width, height);
  const buffer =
    mime === 'image/webp'
      ? canvas.toBuffer('image/webp', WEBP_QUALITY)
      : canvas.toBuffer('image/jpeg', WEBP_QUALITY);
  return { buffer, width, height };
}

export async function processMediaOptimizeJob(_env: unknown, data: MediaOptimizePayload): Promise<void> {
  const { mediaAssetId, tenantId, s3Key } = data;
  if (!mediaAssetId || !tenantId || !s3Key) {
    throw new Error('media-optimize: missing mediaAssetId, tenantId or s3Key');
  }
  if (!isWorkerS3Configured()) {
    throw new Error('S3 не настроен в worker');
  }

  const prisma = getPrisma();
  const asset = await prisma.mediaAsset.findFirst({
    where: { id: mediaAssetId, tenantId },
  });
  if (!asset || asset.status !== 'ready') {
    return;
  }

  const sourceBuffer = await getObjectBuffer(s3Key);
  const originalKey = s3Key;

  const needsStoreOptimize =
    sourceBuffer.length > 2 * 1024 * 1024 ||
    (asset.width != null && asset.width > STORE_MAX_SIDE) ||
    (asset.height != null && asset.height > STORE_MAX_SIDE);

  const update: {
    size?: bigint;
    width?: number;
    height?: number;
    mimeType?: string;
    fileName?: string;
    s3Key?: string;
  } = {};

  if (needsStoreOptimize) {
    const optimized = await resizeToBuffer(sourceBuffer, STORE_MAX_SIDE, 'image/webp');
    const optimizedKey = s3Key.replace(/(\.[^.]+)?$/, '.webp');
    await putObjectBuffer({
      key: optimizedKey,
      body: optimized.buffer,
      contentType: 'image/webp',
    });
    update.s3Key = optimizedKey;
    update.size = BigInt(optimized.buffer.length);
    update.width = optimized.width;
    update.height = optimized.height;
    update.mimeType = 'image/webp';
    if (!asset.fileName.toLowerCase().endsWith('.webp')) {
      update.fileName = asset.fileName.replace(/\.[^.]+$/, '.webp');
    }
  }

  await prisma.mediaAsset.update({
    where: { id: mediaAssetId },
    data: update,
  });

  if (needsStoreOptimize && update.s3Key && update.s3Key !== originalKey) {
    try {
      await deleteObjectByKey(originalKey);
    } catch {
      // исходник можно удалить позже при удалении ассета
    }
  }
}
