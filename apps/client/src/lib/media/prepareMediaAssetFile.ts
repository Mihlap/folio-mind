import {
  MEDIA_JPEG_QUALITY,
  MEDIA_MAX_FILE_BYTES,
  MEDIA_MAX_PIXEL_SIDE,
  MEDIA_STORE_MAX_PIXEL_SIDE,
  formatBytesShort,
} from '@folio-mind/store';

export type PreparedMediaFile = {
  file: File;
  width: number;
  height: number;
  wasOptimized: boolean;
};

/** Сжимать файлы больше этого порога (2 МБ). */
const COMPRESS_IF_LARGER_THAN_BYTES = 2 * 1024 * 1024;

function replaceExt(name: string, ext: string): string {
  const base = name.replace(/\.[^.]+$/, '');
  return `${base}${ext}`;
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Не удалось прочитать изображение'));
    };
    img.src = url;
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

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error('Не удалось сжать изображение')),
      type,
      quality,
    );
  });
}

async function rasterizeToFile(
  img: HTMLImageElement,
  sourceName: string,
  targetW: number,
  targetH: number,
  preferPng: boolean,
  jpegQuality: number,
): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Не удалось подготовить изображение');
  }
  ctx.drawImage(img, 0, 0, targetW, targetH);

  const usePng = preferPng && imageHasAlpha(ctx, targetW, targetH);
  if (usePng) {
    const blob = await canvasToBlob(canvas, 'image/png');
    return new File([blob], replaceExt(sourceName, '.png'), { type: 'image/png' });
  }

  const blob = await canvasToBlob(canvas, 'image/jpeg', jpegQuality);
  return new File([blob], replaceExt(sourceName, '.jpg'), { type: 'image/jpeg' });
}

/**
 * Проверяет лимиты и при необходимости сжимает изображение перед загрузкой в медиатеку.
 */
export async function prepareMediaAssetFile(file: File): Promise<PreparedMediaFile> {
  const img = await loadImageFromFile(file);
  const width = img.naturalWidth;
  const height = img.naturalHeight;
  const longest = Math.max(width, height);

  if (longest > MEDIA_MAX_PIXEL_SIDE) {
    throw new Error(
      `Изображение слишком большое (${longest}px по длинной стороне, макс. ${MEDIA_MAX_PIXEL_SIDE}px). Уменьшите перед загрузкой.`,
    );
  }

  const needsCompress =
    file.size > COMPRESS_IF_LARGER_THAN_BYTES || longest > MEDIA_STORE_MAX_PIXEL_SIDE;

  if (!needsCompress) {
    if (file.size > MEDIA_MAX_FILE_BYTES) {
      throw new Error(`Файл слишком большой (макс. ${formatBytesShort(MEDIA_MAX_FILE_BYTES)})`);
    }
    return { file, width, height, wasOptimized: false };
  }

  const scale =
    longest > MEDIA_STORE_MAX_PIXEL_SIDE ? MEDIA_STORE_MAX_PIXEL_SIDE / longest : 1;
  const targetW = Math.max(1, Math.round(width * scale));
  const targetH = Math.max(1, Math.round(height * scale));
  const preferPng = file.type === 'image/png' || /\.png$/i.test(file.name);

  let outFile = await rasterizeToFile(
    img,
    file.name,
    targetW,
    targetH,
    preferPng,
    MEDIA_JPEG_QUALITY,
  );

  if (outFile.size > MEDIA_MAX_FILE_BYTES && outFile.type === 'image/jpeg') {
    outFile = await rasterizeToFile(img, file.name, targetW, targetH, false, 0.72);
  }

  if (outFile.size > MEDIA_MAX_FILE_BYTES) {
    throw new Error(
      `Не удалось уложиться в лимит ${formatBytesShort(MEDIA_MAX_FILE_BYTES)}. Уменьшите изображение вручную.`,
    );
  }

  return {
    file: outFile,
    width: targetW,
    height: targetH,
    wasOptimized: true,
  };
}
