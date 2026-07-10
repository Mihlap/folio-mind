import {
  isFullLayoutCrop,
  isLayoutImageObject,
  isLayoutShapeObject,
  layoutFillToCss,
  normalizeLayoutCrop,
  type LayoutImageObject,
  type LayoutPageObject,
  type LayoutRect,
  type LayoutShapeObject,
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

function applyImageAdjustments(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  brightness = 0,
  contrast = 0,
): void {
  if (brightness === 0 && contrast === 0) return;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  const brightnessOffset = brightness * 2.55;
  for (let i = 0; i < data.length; i += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      const index = i + channel;
      let value = data[index]!;
      value = contrastFactor * (value - 128) + 128 + brightnessOffset;
      data[index] = Math.max(0, Math.min(255, Math.round(value)));
    }
  }
  ctx.putImageData(imageData, 0, 0);
}

async function renderAdjustedImageDataUrl(
  imageSrc: string,
  crop: LayoutRect | undefined,
  brightness?: number,
  contrast?: number,
): Promise<string> {
  const cropped = await applyCropToDataUrl(imageSrc, crop);
  const b = brightness ?? 0;
  const c = contrast ?? 0;
  if (b === 0 && c === 0) return cropped;
  const img = await loadImageElement(cropped);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Не удалось подготовить изображение');
  ctx.drawImage(img, 0, 0);
  applyImageAdjustments(ctx, canvas.width, canvas.height, b, c);
  const head = cropped.trim().slice(0, 32).toLowerCase();
  if (head.startsWith('data:image/png')) return canvas.toDataURL('image/png');
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
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

async function rasterizeLayoutShape(
  shape: LayoutShapeObject,
  pageWidthPt: number,
  pageHeightPt: number,
): Promise<string> {
  const width = Math.max(64, Math.round(shape.rect.width * pageWidthPt));
  const height = Math.max(64, Math.round(shape.rect.height * pageHeightPt));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Не удалось подготовить подложку');

  if (shape.fill.type === 'solid') {
    ctx.fillStyle = layoutFillToCss(shape.fill);
    ctx.fillRect(0, 0, width, height);
  } else {
    const angle = (shape.fill.angleDeg * Math.PI) / 180;
    const cx = width / 2;
    const cy = height / 2;
    const len = Math.sqrt(width * width + height * height);
    const x0 = cx - (Math.cos(angle) * len) / 2;
    const y0 = cy - (Math.sin(angle) * len) / 2;
    const x1 = cx + (Math.cos(angle) * len) / 2;
    const y1 = cy + (Math.sin(angle) * len) / 2;
    const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
    for (const stop of shape.fill.stops) {
      gradient.addColorStop(stop.offset, stop.color);
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  return canvas.toDataURL('image/png');
}

export async function normalizeLayoutObjectsForPdf(
  objects: LayoutPageObject[],
  pageWidthPt = 595,
  pageHeightPt = 842,
): Promise<LayoutImageObject[]> {
  const result: LayoutImageObject[] = [];
  for (const object of objects) {
    if (isLayoutImageObject(object)) {
      const adjusted = await renderAdjustedImageDataUrl(
        object.imageSrc,
        object.crop,
        object.brightness,
        object.contrast,
      );
      result.push({
        ...object,
        kind: 'image',
        imageSrc: await compressLayoutImageSrcForUpload(adjusted),
        crop: undefined,
        brightness: undefined,
        contrast: undefined,
      });
      continue;
    }
    if (isLayoutShapeObject(object)) {
      const imageSrc = await rasterizeLayoutShape(object, pageWidthPt, pageHeightPt);
      result.push({
        kind: 'image',
        id: object.id,
        page: object.page,
        rect: object.rect,
        imageSrc: await compressLayoutImageSrcForUpload(imageSrc),
        rotation: object.rotation ?? 0,
      });
    }
  }
  return result;
}

export function estimateLayoutObjectsBytes(objects: LayoutPageObject[]): number {
  return objects.reduce((sum, object) => {
    if (isLayoutImageObject(object)) {
      return sum + estimateDataUrlBytes(object.imageSrc);
    }
    return sum + 80_000;
  }, 0);
}
