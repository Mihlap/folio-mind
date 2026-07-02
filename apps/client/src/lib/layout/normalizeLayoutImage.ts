import {
  isFullLayoutCrop,
  normalizeLayoutCrop,
  type LayoutRect,
} from '@folio-mind/store';

const PDF_IMAGE_PREFIXES = ['data:image/png', 'data:image/jpeg', 'data:image/jpg'] as const;
const MAX_LAYOUT_UPLOAD_PX = 1600;
const MAX_LAYOUT_UPLOAD_BYTES = 450_000;
const JPEG_QUALITY = 0.82;

function isPdfReadyDataUrl(imageSrc: string): boolean {
  const head = imageSrc.trim().slice(0, 32).toLowerCase();
  return PDF_IMAGE_PREFIXES.some((prefix) => head.startsWith(prefix));
}

function isWebpDataUrl(imageSrc: string): boolean {
  return imageSrc.trim().toLowerCase().startsWith('data:image/webp');
}

function estimateDataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.split(',')[1] ?? '';
  return Math.ceil((base64.length * 3) / 4);
}

function loadImageElement(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Не удалось прочитать изображение'));
    img.src = dataUrl;
  });
}

function convertDataUrlToPngViaCanvas(dataUrl: string): Promise<string> {
  return loadImageElement(dataUrl).then((img) => {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Не удалось подготовить изображение');
    }
    ctx.drawImage(img, 0, 0);
    return canvas.toDataURL('image/png');
  });
}

function imageHasAlpha(ctx: CanvasRenderingContext2D, width: number, height: number): boolean {
  const sampleW = Math.min(width, 64);
  const sampleH = Math.min(height, 64);
  const data = ctx.getImageData(0, 0, sampleW, sampleH).data;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i]! < 255) return true;
  }
  return false;
}

async function resizeDataUrlForUpload(dataUrl: string): Promise<string> {
  const img = await loadImageElement(dataUrl);
  const { naturalWidth: width, naturalHeight: height } = img;
  const longest = Math.max(width, height);
  const approxBytes = estimateDataUrlBytes(dataUrl);
  if (longest <= MAX_LAYOUT_UPLOAD_PX && approxBytes <= MAX_LAYOUT_UPLOAD_BYTES) {
    return dataUrl;
  }

  const scale = longest > MAX_LAYOUT_UPLOAD_PX ? MAX_LAYOUT_UPLOAD_PX / longest : 1;
  const targetW = Math.max(1, Math.round(width * scale));
  const targetH = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Не удалось подготовить изображение');
  }
  ctx.drawImage(img, 0, 0, targetW, targetH);
  const usePng = dataUrl.startsWith('data:image/png') && imageHasAlpha(ctx, targetW, targetH);
  return usePng
    ? canvas.toDataURL('image/png')
    : canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}

export async function normalizeLayoutImageSrcForPdf(imageSrc: string): Promise<string> {
  if (isPdfReadyDataUrl(imageSrc)) return imageSrc;
  if (
    isWebpDataUrl(imageSrc) ||
    imageSrc.trim().toLowerCase().startsWith('data:image/gif') ||
    imageSrc.trim().toLowerCase().startsWith('data:image/bmp')
  ) {
    return convertDataUrlToPngViaCanvas(imageSrc);
  }
  throw new Error('Поддерживаются PNG, JPEG и WebP');
}

export async function applyCropToDataUrl(imageSrc: string, crop?: LayoutRect): Promise<string> {
  const normalized = normalizeLayoutCrop(crop);
  if (isFullLayoutCrop(normalized)) return imageSrc;

  const img = await loadImageElement(imageSrc);
  const sx = Math.round(normalized.x * img.naturalWidth);
  const sy = Math.round(normalized.y * img.naturalHeight);
  const sw = Math.max(1, Math.round(normalized.width * img.naturalWidth));
  const sh = Math.max(1, Math.round(normalized.height * img.naturalHeight));

  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Не удалось обрезать изображение');
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

  const head = imageSrc.trim().slice(0, 32).toLowerCase();
  if (head.startsWith('data:image/png')) return canvas.toDataURL('image/png');
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}

export async function compressLayoutImageSrcForDraft(imageSrc: string): Promise<string> {
  const normalized = await normalizeLayoutImageSrcForPdf(imageSrc);
  return resizeDataUrlForUpload(normalized);
}

export async function compressLayoutImageSrcForUpload(imageSrc: string): Promise<string> {
  const normalized = await normalizeLayoutImageSrcForPdf(imageSrc);
  return resizeDataUrlForUpload(normalized);
}

type LayoutObjectForPdf = { imageSrc: string; crop?: LayoutRect };

export async function normalizeLayoutObjectsForPdf<T extends LayoutObjectForPdf>(
  objects: T[],
): Promise<T[]> {
  return Promise.all(
    objects.map(async (object) => {
      const cropped = await applyCropToDataUrl(object.imageSrc, object.crop);
      return {
        ...object,
        imageSrc: await compressLayoutImageSrcForUpload(cropped),
        crop: undefined,
      };
    }),
  );
}

export function estimateLayoutObjectsBytes(objects: Array<{ imageSrc: string }>): number {
  return objects.reduce((sum, object) => sum + estimateDataUrlBytes(object.imageSrc), 0);
}
