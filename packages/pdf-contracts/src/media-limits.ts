export const MEDIA_MAX_FILE_BYTES = 25 * 1024 * 1024;

export const MEDIA_TENANT_QUOTA_BYTES_DEFAULT = 10 * 1024 * 1024 * 1024;

export const MEDIA_MAX_PIXEL_SIDE = 6000;

export const MEDIA_STORE_MAX_PIXEL_SIDE = 4096;

export const MEDIA_JPEG_QUALITY = 0.85;

export type MediaQuotaInfo = {
  usedBytes: string;
  limitBytes: string;
  fileCount: number;
  maxFileBytes: string;
  maxPixelSide: number;
  storeMaxPixelSide: number;
};

export function formatBytesShort(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10_240 ? 1 : 0)} КБ`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} ГБ`;
}
